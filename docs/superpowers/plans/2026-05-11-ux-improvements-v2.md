# UX Improvements v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete and ship 5 UX improvements to the gym trainer app: expanded weekly plan view, free-order exercise logging, AI substitute-to-plan, continue/completed state persistence, and removal of the workout nav tab.

**Architecture:** Features 1, 2, 4, and 5 are already implemented in the current branch (`feat/ux-improvements-v2`). The sole remaining implementation work is Feature 3: updating `SessionChat.tsx` to accept an `onAddExercise` callback, parse substitute suggestions from AI replies with a regex heuristic, and render an "ADD TO TODAY'S PLAN" button inside the reply card. The workout page already calls `onAddExercise={handleAddExercise}` — it just needs SessionChat to wire it up.

**Tech Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · Supabase · OpenRouter AI · Jest + Testing Library

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/components/BottomNav.tsx` | ✓ Done | 3-item nav (Home, History, Profile) — no workout/log link |
| `src/app/dashboard/page.tsx` | ✓ Done | Expandable weekly plan card + CONTINUE vs START button |
| `src/app/workout/[id]/page.tsx` | ✓ Done | All-exercises list, free-order logging, pre-completed state, `handleAddExercise` |
| `src/components/SessionChat.tsx` | **Needs work** | Add `onAddExercise` prop, substitute name extraction, "Add to Plan" button |
| `src/components/__tests__/SessionChat.test.tsx` | **Create** | Tests for substitute detection and `onAddExercise` callback |

---

## Task 1: Verify Already-Implemented Features

**Files:** (read-only, no edits)

- [ ] **Step 1: Verify Feature 5 — BottomNav has 3 items only**

Open `src/components/BottomNav.tsx`. Confirm `NAV_ITEMS` contains exactly:
```ts
{ href: '/dashboard', icon: 'dashboard', label: 'Home' },
{ href: '/history', icon: 'monitoring', label: 'History' },
{ href: '/profile', icon: 'person', label: 'Profile' },
```
No `/workout/log` entry should exist.

- [ ] **Step 2: Verify Feature 1 — Dashboard weekly plan expanded view**

Open `src/app/dashboard/page.tsx`. Confirm all of the following exist:
- `const [planExpanded, setPlanExpanded] = useState(false)` — toggle state
- `<button onClick={() => setPlanExpanded(prev => !prev)}` — toggle button
- `weekDays` array built from `weeklyPlan.day_slots`
- `{planExpanded && <div ...>{weekDays.map(...` — conditional render of 7-day grid
- Each day row shows: `DAY_SHORT`, focus badge with `FOCUS_COLOR`, checkmark/icon for status

- [ ] **Step 3: Verify Feature 4 — CONTINUE vs START button**

In `src/app/dashboard/page.tsx`, confirm:
- `const [todayHasLoggedExercises, setTodayHasLoggedExercises] = useState(false)` exists
- The count query `supabase.from('workout_exercises').select('id', { count: 'exact', head: true }).eq('workout_id', todayId)` runs when `todayId` is set
- Button text: `todayHasLoggedExercises ? 'CONTINUE WORKOUT' : 'START WORKOUT'`

- [ ] **Step 4: Verify Feature 2 — All exercises at once (free-order)**

In `src/app/workout/[id]/page.tsx`, confirm:
- No `currentIndex` state — only `activeIdx: number | null`
- `preCompletedNames: Set<string>` loaded from `workout_exercises` on mount
- `workout.exercises.map((ex, i) => ...)` renders ALL exercises as cards
- `isActive = activeIdx === i` controls which card shows the inline `<ExerciseLogger />`
- Progress bar: `completedCount = loggedNames.size + preCompletedNames.size`

- [ ] **Step 5: Run lint to confirm no regressions**

```bash
cd /Users/prasanthp/Documents/Work/AIgency/gym_trainer && pnpm lint
```
Expected: No errors.

- [ ] **Step 6: Commit the already-implemented features**

```bash
git add src/app/dashboard/page.tsx src/app/workout/[id]/page.tsx src/components/BottomNav.tsx
git commit -m "feat: weekly plan view, free-order exercise logging, continue state, remove workout nav tab"
```

---

## Task 2: Feature 3 — SessionChat Substitute Detection and Add-to-Plan

**Files:**
- Modify: `src/components/SessionChat.tsx`
- Create: `src/components/__tests__/SessionChat.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/SessionChat.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionChat } from '../SessionChat'
import type { SuggestedWorkout } from '@/lib/types'

const mockWorkout: SuggestedWorkout = {
  title: 'Push Day',
  estimated_minutes: 45,
  muscle_groups: ['chest'],
  exercises: [
    { name: 'Bench Press', type: 'strength', sets: 3, reps: 10, muscle_groups: ['chest'] },
  ],
}

beforeEach(() => {
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('SessionChat', () => {
  it('does NOT show Add to Plan button when reply has no substitute', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: 'Keep your elbows at 45 degrees to protect your shoulders.' }),
    })

    render(
      <SessionChat
        workout={mockWorkout}
        currentExercise="Bench Press"
        onClose={() => {}}
        onAddExercise={jest.fn()}
      />
    )

    fireEvent.click(screen.getByText("Don't know this exercise"))
    await waitFor(() => screen.getByText(/elbows/i))

    expect(screen.queryByRole('button', { name: /add to today's plan/i })).not.toBeInTheDocument()
  })

  it('shows Add to Plan button when AI reply contains substitute phrasing', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: 'I suggest you substitute with Push-Ups instead of bench press. They target the same muscles.',
      }),
    })

    render(
      <SessionChat
        workout={mockWorkout}
        currentExercise="Bench Press"
        onClose={() => {}}
        onAddExercise={jest.fn()}
      />
    )

    fireEvent.click(screen.getByText('Suggest a substitute'))
    await waitFor(() => screen.getByRole('button', { name: /add to today's plan/i }))

    expect(screen.getByRole('button', { name: /add to today's plan/i })).toBeInTheDocument()
  })

  it('calls onAddExercise with a valid SuggestedExercise when Add to Plan is clicked', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: 'Try substituting with Push-Ups instead. Great bodyweight option.',
      }),
    })

    const onAddExercise = jest.fn()
    render(
      <SessionChat
        workout={mockWorkout}
        currentExercise="Bench Press"
        onClose={() => {}}
        onAddExercise={onAddExercise}
      />
    )

    fireEvent.click(screen.getByText('Suggest a substitute'))
    await waitFor(() => screen.getByRole('button', { name: /add to today's plan/i }))
    fireEvent.click(screen.getByRole('button', { name: /add to today's plan/i }))

    expect(onAddExercise).toHaveBeenCalledTimes(1)
    expect(onAddExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.any(String),
        type: 'strength',
        sets: 3,
        reps: 10,
        muscle_groups: expect.any(Array),
      })
    )
  })

  it('hides Add to Plan button when onAddExercise prop is not provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: 'Try substituting with Dumbbell Press instead.',
      }),
    })

    render(
      <SessionChat
        workout={mockWorkout}
        currentExercise="Bench Press"
        onClose={() => {}}
        // no onAddExercise prop
      />
    )

    fireEvent.click(screen.getByText('Suggest a substitute'))
    await waitFor(() => screen.getByText(/Dumbbell Press/i))

    expect(screen.queryByRole('button', { name: /add to today's plan/i })).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/prasanthp/Documents/Work/AIgency/gym_trainer && pnpm test -- SessionChat
```
Expected: FAIL — `Property 'onAddExercise' does not exist on type 'Props'` or similar.

- [ ] **Step 3: Update SessionChat.tsx**

Replace `src/components/SessionChat.tsx` entirely with:

```tsx
'use client'

import { useState } from 'react'
import type { SuggestedWorkout, SuggestedExercise } from '@/lib/types'

interface Props {
  workout: SuggestedWorkout
  currentExercise: string
  onClose: () => void
  onAddExercise?: (exercise: SuggestedExercise) => void
}

const QUICK_PROMPTS = [
  "No equipment available",
  "Don't know this exercise",
  "Too heavy for me",
  "Suggest a substitute",
]

// Returns exercise name if the reply suggests a substitute, null otherwise.
// Looks for "with <Name>" or "try <Name>" near substitute/instead/replace keywords.
function extractSubstituteName(reply: string): string | null {
  const lower = reply.toLowerCase()
  if (!lower.includes('substitute') && !lower.includes('instead') && !lower.includes('replace')) {
    return null
  }
  const match = reply.match(/(?:with|try)\s+([A-Z][a-zA-Z\s-]{2,30})(?:\s+instead|\s+as|[.,!]|$)/i)
  return match ? match[1].trim() : null
}

export function SessionChat({ workout, currentExercise, onClose, onAddExercise }: Props) {
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [suggestedName, setSuggestedName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function sendMessage(msg?: string) {
    const text = msg ?? message
    if (!text.trim()) return
    setLoading(true)
    setSuggestedName(null)

    try {
      const res = await fetch('/api/session-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          todayWorkout: workout,
          exerciseName: currentExercise,
          userMessage: text,
        }),
      })
      const data = await res.json()
      setReply(data.reply)
      setSuggestedName(extractSubstituteName(data.reply))
    } catch {
      setReply("I'm having trouble connecting. Try a similar movement with the same equipment.")
    } finally {
      setLoading(false)
    }
  }

  function handleAddExercise() {
    if (!suggestedName || !onAddExercise) return
    onAddExercise({
      name: suggestedName,
      type: 'strength',
      sets: 3,
      reps: 10,
      muscle_groups: [],
      notes: `AI-suggested substitute for ${currentExercise}`,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end z-50" onClick={onClose}>
      <div
        className="bg-surface-container-low border-t border-white/10 rounded-t-3xl w-full max-w-md mx-auto p-md space-y-md shadow-[0_-8px_40px_rgba(0,0,0,0.8)]"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center -mt-2 mb-xs">
          <div className="w-10 h-1 rounded-full bg-outline-variant" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-headline-md text-headline-md text-primary uppercase">Ask Trainer</h3>
            <p className="font-label-caps text-label-caps text-primary-container tracking-widest mt-base">
              {currentExercise.toUpperCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* AI Reply */}
        {reply && (
          <div className="bg-surface-container border border-primary-container/20 rounded-xl p-sm shadow-[0_0_20px_rgba(195,244,0,0.05)]">
            <div className="flex items-center gap-xs mb-xs">
              <span
                className="material-symbols-outlined text-primary-container text-[16px]"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                smart_toy
              </span>
              <span className="font-label-caps text-label-caps text-primary-container tracking-widest">
                AI TRAINER
              </span>
            </div>
            <p className="font-body-md text-body-md text-on-surface">{reply}</p>
            {suggestedName && onAddExercise && (
              <button
                onClick={handleAddExercise}
                className="mt-sm w-full flex items-center justify-center gap-xs font-label-caps text-[11px] tracking-wider bg-primary-container/10 border border-primary-container/30 text-primary-container py-xs rounded-xl hover:bg-primary-container/20 transition-all"
              >
                <span className="material-symbols-outlined text-[14px]">add_circle</span>
                ADD TO TODAY'S PLAN
              </button>
            )}
          </div>
        )}

        {/* Quick prompts */}
        <div className="flex flex-wrap gap-xs">
          {QUICK_PROMPTS.map(q => (
            <button
              key={q}
              onClick={() => { setMessage(q); sendMessage(q) }}
              disabled={loading}
              className="text-xs bg-surface-container-high hover:bg-surface-container border border-outline-variant hover:border-primary-container/50 rounded-full px-sm py-xs text-on-surface-variant hover:text-primary transition-all font-label-caps"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="flex gap-xs">
          <input
            type="text"
            placeholder="Ask anything about this exercise..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            className="flex-1 bg-surface-container-high text-on-surface placeholder-on-surface-variant/50 rounded-xl px-sm py-xs border-b-2 border-outline-variant focus:border-primary-container outline-none font-body-md text-body-md"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !message.trim()}
            className="bg-gradient-to-br from-primary-container to-[#8ba800] text-on-primary-container px-sm py-xs rounded-xl font-label-caps text-label-caps disabled:opacity-40 hover:opacity-90 transition-all glow-primary"
          >
            {loading ? (
              <span className="material-symbols-outlined text-[18px] animate-spin">autorenew</span>
            ) : (
              <span className="material-symbols-outlined text-[18px]">send</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to confirm passing**

```bash
cd /Users/prasanthp/Documents/Work/AIgency/gym_trainer && pnpm test -- SessionChat
```
Expected: 4 tests PASS.

- [ ] **Step 5: Confirm TypeScript has no errors**

```bash
cd /Users/prasanthp/Documents/Work/AIgency/gym_trainer && pnpm build
```
Expected: Exits 0, no type errors.

- [ ] **Step 6: Manual test in dev server**

```bash
pnpm dev
```
1. Go to http://localhost:3000 → Start a workout
2. Tap the trainer chat icon (top-right, `support_agent`)
3. Click "Suggest a substitute"
4. Wait for AI reply — confirm "ADD TO TODAY'S PLAN" button appears below the reply
5. Click it — confirm a new exercise card appears at the bottom of the exercise list
6. Tap "LOG" on the new card — confirm it can be logged normally

- [ ] **Step 7: Commit Feature 3**

```bash
git add src/components/SessionChat.tsx src/components/__tests__/SessionChat.test.tsx
git commit -m "feat: SessionChat substitute detection and Add to Plan action"
```

---

## Task 3: Final End-to-End Verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/prasanthp/Documents/Work/AIgency/gym_trainer && pnpm test
```
Expected: All tests pass.

- [ ] **Step 2: Production build**

```bash
cd /Users/prasanthp/Documents/Work/AIgency/gym_trainer && pnpm build
```
Expected: Build succeeds, no errors.

- [ ] **Step 3: Manual walkthrough of all 5 features**

1. **Feature 5** — Bottom nav has exactly 3 tabs: Home, History, Profile. No "Workout" tab.
2. **Feature 1** — Dashboard: tap the "This Week — PPL" card header → 7-day grid expands showing day, focus badge, status icon. Tap again → collapses. "Regenerate" button in expanded view calls the API.
3. **Feature 4 (dashboard side)** — If a workout was started today, button reads "CONTINUE WORKOUT". If not, reads "START WORKOUT".
4. **Feature 2** — Open a workout: all exercises are listed at once. Tap "LOG" on any (not just first). Logger expands inline. After logging, card shows ✓ Done. Can log exercises in any order.
5. **Feature 4 (session side)** — Navigate away from workout then back. Previously logged exercises show ✓ (pre-completed, no LOG button). Progress bar accounts for them.
6. **Feature 3** — Open trainer chat during workout. Ask "Suggest a substitute". Reply shows "ADD TO TODAY'S PLAN" button. Click it → new exercise added to list.

- [ ] **Step 4: Open PR**

```bash
gh pr create \
  --base main \
  --title "feat: UX improvements v2 — weekly plan, free-order logging, substitute-to-plan" \
  --body "$(cat <<'EOF'
## Summary
- Expanded weekly plan card on dashboard with 7-day focus grid and regenerate action
- Free-order exercise logging: all exercises visible at once, log any in any order
- Continue/completed state: dashboard shows CONTINUE if exercises already logged; session pre-marks done exercises
- AI substitute-to-plan: SessionChat detects substitute suggestions and shows Add to Plan button
- Removed Workout tab from bottom nav (access via dashboard only)

## Test plan
- [ ] `pnpm test` passes
- [ ] `pnpm build` succeeds
- [ ] Dashboard weekly plan expands/collapses
- [ ] Workout page shows all exercises simultaneously
- [ ] Returning to an in-progress workout shows previously logged exercises as done
- [ ] Trainer chat Add to Plan button appears on substitute suggestions and appends exercise to list
- [ ] Bottom nav has exactly 3 items
EOF
)"
```
