# Agentic Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the AI layer as a periodized agentic trainer — a committed training block managed by Claude Sonnet, with fast DeepSeek session generation, a persistent coaching conversation, and weekly auto-regulation.

**Architecture:** Three-tier model: (1) Claude Sonnet agent loop for program generation, trainer chat, and weekly review — multi-step tool use via Vercel AI SDK `generateText`/`streamText`; (2) DeepSeek fast call via OpenRouter for daily session formatting; (3) pure TypeScript for progressive overload calculations. The training program block is the source of truth; the agent writes it once and the fast path reads it.

**Tech Stack:** Next.js 14 App Router · Vercel AI SDK v4 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`) · Zod · Supabase · TypeScript

---

## ⚠️ Plan Amendments (v2 — 2026-05-12)

**The spec was updated after this plan was written. The sections below OVERRIDE the corresponding tasks. Read these first — they supersede any conflicting code in the tasks below.**

Reference spec: `docs/superpowers/specs/2026-05-12-agentic-trainer-design.md`

---

### Amendment A — Migration SQL (replaces Task 2 Step 1)

`program_weeks` needs a `reviewing` status and an `updated_at` column for the state machine:

```sql
-- Migration 1: Add goal fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS primary_goal text
    CHECK (primary_goal IN ('hypertrophy','strength','fat_loss','endurance','general_fitness')),
  ADD COLUMN IF NOT EXISTS goal_duration_weeks int,
  ADD COLUMN IF NOT EXISTS goal_set_at timestamptz;

-- Migration 2: training_programs (unchanged from original plan)
CREATE TABLE IF NOT EXISTS training_programs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal           text NOT NULL,
  duration_weeks int NOT NULL,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','completed','paused')),
  phases         jsonb NOT NULL,
  week_plan      jsonb NOT NULL,
  model_used     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE training_programs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_programs' AND policyname = 'users own programs') THEN
    CREATE POLICY "users own programs" ON training_programs FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Migration 3: program_weeks — NOTE: 'reviewing' added to status, updated_at added
CREATE TABLE IF NOT EXISTS program_weeks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id       uuid NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_number      int NOT NULL,
  week_start       date NOT NULL,
  prescribed       jsonb,
  actual           jsonb,
  adjustment_notes text,
  status           text NOT NULL DEFAULT 'upcoming'
                     CHECK (status IN ('upcoming','active','reviewing','completed','adjusted')),
  reviewed_at      timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, week_number)
);
ALTER TABLE program_weeks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'program_weeks' AND policyname = 'users own program weeks') THEN
    CREATE POLICY "users own program weeks" ON program_weeks FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Migration 4: trainer_messages (unchanged from original plan)
CREATE TABLE IF NOT EXISTS trainer_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('trainer','user')),
  content      text NOT NULL,
  message_type text NOT NULL DEFAULT 'chat'
                 CHECK (message_type IN ('chat','check_in','program_adjustment','session_feedback','weekly_review')),
  metadata     jsonb,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE trainer_messages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trainer_messages' AND policyname = 'users own messages') THEN
    CREATE POLICY "users own messages" ON trainer_messages FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;
```

---

### Amendment B — Types (replaces Task 3 Step 2)

Replace the `ProgramWeek` type and add `PerformanceSummary`:

```ts
export type PrimaryGoal = 'hypertrophy' | 'strength' | 'fat_loss' | 'endurance' | 'general_fitness'

export interface TrainingProgram {
  id: string
  user_id: string
  goal: PrimaryGoal
  duration_weeks: number
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'paused'
  phases: ProgramPhase[]
  week_plan: WeekPlan
  model_used: string | null
  created_at: string
}

export interface ProgramPhase {
  name: string
  week_range: [number, number]
  focus: string
  intensity: string
}

export type WeekPlan = Record<string, Record<string, DaySlot>>

export interface DaySlot {
  focus: string
  exercises?: PrescribedExercise[]
}

export interface PrescribedExercise {
  name: string
  sets: number
  reps: number
  weight_kg?: number
}

export interface ProgramWeek {
  id: string
  program_id: string
  user_id: string
  week_number: number
  week_start: string
  prescribed: WeekPlan | null
  actual: Record<string, unknown> | null
  adjustment_notes: string | null
  status: 'upcoming' | 'active' | 'reviewing' | 'completed' | 'adjusted'
  reviewed_at: string | null
  updated_at: string
}

export interface TrainerMessage {
  id: string
  user_id: string
  role: 'trainer' | 'user'
  content: string
  message_type: 'chat' | 'check_in' | 'program_adjustment' | 'session_feedback' | 'weekly_review'
  metadata: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

// Returned by get_workout_history when days > 14 (context-efficient summary)
export interface PerformanceSummary {
  exercise_name: string
  estimated_1rm_trend_kg: number | null
  weekly_volume_trend: 'increasing' | 'stable' | 'decreasing'
  last_rpe: number | null
  sessions_count: number
}
```

---

### Amendment C — calculateProgressiveOverload RPE support (extends Task 4)

Add these two RPE tests to the test file, and update the function to accept `lastRpe`:

**Additional tests for `src/lib/__tests__/progressiveOverload.test.ts`:**
```ts
it('adds extra 5kg on top of normal increment when last RPE was ≤ 6', () => {
  const result = calculateProgressiveOverload({
    exerciseName: 'Bench Press',
    targetSets: 4,
    targetReps: 8,
    history: [
      { weight_kg: 80, reps: 9, date: '2026-05-11' },
      { weight_kg: 80, reps: 8, date: '2026-05-08' },
    ],
    lastRpe: 6,
  })
  // RPE ≤ 6 means it was easy — advance by 5 instead of 2.5
  expect(result.recommended_weight_kg).toBe(85)
  expect(result.rpe_note).toMatch(/easy/)
})

it('holds weight and flags overreach when last RPE was 10', () => {
  const result = calculateProgressiveOverload({
    exerciseName: 'Bench Press',
    targetSets: 4,
    targetReps: 8,
    history: [{ weight_kg: 80, reps: 8, date: '2026-05-11' }],
    lastRpe: 10,
  })
  expect(result.recommended_weight_kg).toBe(80)
  expect(result.rpe_note).toMatch(/overreach/)
})
```

**Updated function signature and RPE logic** in `src/lib/progressiveOverload.ts`:

```ts
export type OverloadResult = {
  recommended_weight_kg: number
  basis: string
  confidence: 'high' | 'medium' | 'low'
  rpe_note?: string
}

export function calculateProgressiveOverload(params: {
  exerciseName: string
  targetSets: number
  targetReps: number
  history: ExerciseHistoryEntry[]
  prescribedWeight?: number | null
  lastRpe?: number | null
}): OverloadResult {
  const { targetReps, history, prescribedWeight, lastRpe } = params

  const valid = history
    .filter(h => h.weight_kg !== null && h.weight_kg > 0 && h.reps !== null)
    .slice(0, 3)

  if (valid.length === 0) {
    return {
      recommended_weight_kg: prescribedWeight ?? 0,
      basis: prescribedWeight != null ? 'no history — using prescribed weight' : 'no history or prescription',
      confidence: 'low',
    }
  }

  const lastWeight = valid[0].weight_kg!
  const allHitTarget = valid.every(h => (h.reps ?? 0) >= targetReps)

  // RPE overrides: check before standard progression
  if (lastRpe != null && lastRpe >= 9) {
    return {
      recommended_weight_kg: lastWeight,
      basis: `RPE ${lastRpe} last session — hold weight to prevent overreach`,
      confidence: 'medium',
      rpe_note: 'overreach risk — do not increase load',
    }
  }

  if (allHitTarget && valid.length >= 2) {
    const increment = lastRpe != null && lastRpe <= 6 ? 5 : 2.5
    return {
      recommended_weight_kg: lastWeight + increment,
      basis: `${valid.length} sessions hitting target — progress (+${increment}kg)`,
      confidence: 'high',
      rpe_note: lastRpe != null && lastRpe <= 6 ? 'felt easy — larger increment' : undefined,
    }
  }

  if ((valid[0].reps ?? 0) >= targetReps) {
    return {
      recommended_weight_kg: lastWeight,
      basis: `hit target last session — maintain ${lastWeight}kg`,
      confidence: 'medium',
    }
  }

  return {
    recommended_weight_kg: lastWeight,
    basis: `below target reps last session (${valid[0].reps}/${targetReps}) — maintain ${lastWeight}kg`,
    confidence: 'medium',
  }
}
```

---

### Amendment D — Agent tools additions (extends Task 6)

After the existing `get_trainer_history` tool in `createAgentTools`, add these two tools and update two existing ones:

**1. Update `get_workout_history`** to return a `PerformanceSummary[]` when `days > 14`:

```ts
get_workout_history: tool({
  description: 'Get recent workouts. Returns raw Workout[] for days ≤14, PerformanceSummary[] for days >14 to avoid context bloat.',
  parameters: z.object({
    days: z.number().int().min(1).max(90),
    summarise: z.boolean().optional().describe('Override: true=always summarise, false=always raw. Default: auto based on days'),
  }),
  execute: async ({ days, summarise }) => {
    const since = format(addDays(new Date(), -days), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('workouts')
      .select('*, workout_exercises(*)')
      .eq('user_id', userId)
      .gte('date', since)
      .order('date', { ascending: false })

    const workouts = data ?? []
    const shouldSummarise = summarise ?? days > 14

    if (!shouldSummarise) return { workouts }

    // Build PerformanceSummary per exercise
    const byExercise: Record<string, { weights: number[]; rpes: number[]; sessions: Set<string> }> = {}
    for (const w of workouts) {
      for (const ex of (w.workout_exercises ?? [])) {
        if (!ex.exercise_name) continue
        if (!byExercise[ex.exercise_name]) byExercise[ex.exercise_name] = { weights: [], rpes: [], sessions: new Set() }
        if (ex.weight_kg) byExercise[ex.exercise_name].weights.push(ex.weight_kg)
        if (ex.perceived_effort) byExercise[ex.exercise_name].rpes.push(ex.perceived_effort)
        byExercise[ex.exercise_name].sessions.add(w.id)
      }
    }

    const summaries = Object.entries(byExercise).map(([name, data]) => {
      const weights = data.weights
      const trend = weights.length < 2 ? 'stable'
        : weights[0] > weights[weights.length - 1] ? 'increasing'
        : weights[0] < weights[weights.length - 1] ? 'decreasing'
        : 'stable'
      return {
        exercise_name: name,
        estimated_1rm_trend_kg: weights.length ? weights[0] : null,
        weekly_volume_trend: trend as 'increasing' | 'stable' | 'decreasing',
        last_rpe: data.rpes.length ? data.rpes[0] : null,
        sessions_count: data.sessions.size,
      }
    })

    return { summaries }
  },
}),
```

**2. Update `calculate_progressive_overload`** to pass `last_rpe`:

```ts
calculate_progressive_overload: tool({
  description: 'Calculate recommended weight for an exercise based on history, targets, and last RPE',
  parameters: z.object({
    exercise_name: z.string(),
    target_sets: z.number().int(),
    target_reps: z.number().int(),
    last_rpe: z.number().min(1).max(10).optional().describe('RPE from most recent session'),
  }),
  execute: async ({ exercise_name, target_sets, target_reps, last_rpe }) => {
    const { data } = await supabase
      .from('workout_exercises')
      .select('weight_kg, reps, perceived_effort, workouts!inner(date, user_id)')
      .eq('workouts.user_id', userId)
      .eq('exercise_name', exercise_name)
      .order('created_at', { ascending: false })
      .limit(6)

    const history = (data ?? []).map((row: any) => ({
      weight_kg: row.weight_kg,
      reps: row.reps,
      date: row.workouts.date,
    }))
    const resolvedRpe = last_rpe ?? (data?.[0]?.perceived_effort ?? null)

    return calculateProgressiveOverload({
      exerciseName: exercise_name,
      targetSets: target_sets,
      targetReps: target_reps,
      history,
      lastRpe: resolvedRpe,
    })
  },
}),
```

**3. Add `shift_program` tool** (new — for illness, travel, life events):

```ts
shift_program: tool({
  description: 'Re-anchor all remaining (non-completed) program_weeks forward by shift_days days. Use when user reports an absence or extended break.',
  parameters: z.object({
    shift_days: z.number().int().min(1).max(90).describe('Number of days to push remaining weeks forward'),
    reason: z.string(),
  }),
  execute: async ({ shift_days, reason }) => {
    const { data: program } = await supabase
      .from('training_programs')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()

    if (!program) return { success: false, error: 'no active program' }

    const { data: remaining } = await supabase
      .from('program_weeks')
      .select('id, week_start')
      .eq('program_id', program.id)
      .in('status', ['upcoming', 'active'])

    if (!remaining?.length) return { success: true, shifted: 0 }

    const updates = remaining.map(row => ({
      id: row.id,
      week_start: format(addDays(parseISO(row.week_start), shift_days), 'yyyy-MM-dd'),
      adjustment_notes: `Shifted +${shift_days} days: ${reason}`,
    }))

    for (const upd of updates) {
      await supabase.from('program_weeks').update({ week_start: upd.week_start, adjustment_notes: upd.adjustment_notes }).eq('id', upd.id)
    }

    return { success: true, shifted: updates.length }
  },
}),
```

---

### Amendment E — New Task: validateProgram (insert between Task 6 and Task 7)

**Files:**
- Create: `src/lib/agent/validateProgram.ts`
- Create: `src/lib/agent/__tests__/validateProgram.test.ts`

**Step 1: Write failing tests** in `src/lib/agent/__tests__/validateProgram.test.ts`:

```ts
import { validateProgram } from '@/lib/agent/validateProgram'

const validProgram = {
  goal: 'hypertrophy' as const,
  duration_weeks: 8,
  start_date: '2026-05-12',
  phases: [{ name: 'Base', week_range: [1, 8] as [number, number], focus: 'volume', intensity: 'moderate' }],
  week_plan: {
    '1': {
      mon: { focus: 'push', exercises: [{ name: 'Bench Press', sets: 4, reps: 8, weight_kg: 80 }] },
    },
  },
}

describe('validateProgram', () => {
  it('returns valid for a well-formed program', () => {
    const result = validateProgram(validProgram)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('normalises known exercise aliases', () => {
    const program = { ...validProgram, week_plan: { '1': { mon: { focus: 'push', exercises: [{ name: 'BB Bench', sets: 4, reps: 8 }] } } } }
    const result = validateProgram(program)
    expect(result.normalized.week_plan['1']['mon'].exercises![0].name).toBe('Bench Press')
  })

  it('rejects excessive weekly sets per muscle group', () => {
    const exercises = Array.from({ length: 15 }, (_, i) => ({ name: 'Bench Press', sets: 4, reps: 8 }))
    const program = { ...validProgram, week_plan: { '1': { mon: { focus: 'push', exercises } } } }
    const result = validateProgram(program)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/sets/)
  })
})
```

**Step 2: Run tests — expect fail.**

```bash
pnpm test -- validateProgram
```

**Step 3: Implement `src/lib/agent/validateProgram.ts`:**

```ts
import type { PrescribedExercise, WeekPlan } from '@/lib/types'

// Canonical aliases → normalised name
const EXERCISE_ALIASES: Record<string, string> = {
  'BB Bench': 'Bench Press',
  'BB Row': 'Barbell Row',
  'OHP': 'Overhead Press',
  'DB Curl': 'Dumbbell Curl',
  'Pull Up': 'Pull-up',
  'Pullup': 'Pull-up',
  'Chin Up': 'Chin-up',
}

// Muscle groups per exercise (simplified)
const MUSCLE_GROUP: Record<string, string> = {
  'Bench Press': 'chest', 'Incline Bench Press': 'chest', 'Dumbbell Flye': 'chest',
  'Pull-up': 'back', 'Chin-up': 'back', 'Barbell Row': 'back', 'Cable Row': 'back',
  'Overhead Press': 'shoulders', 'Lateral Raise': 'shoulders',
  'Squat': 'quads', 'Leg Press': 'quads', 'Lunge': 'quads',
  'Deadlift': 'hamstrings', 'Romanian Deadlift': 'hamstrings', 'Leg Curl': 'hamstrings',
}

type ProgramInput = {
  goal: string
  duration_weeks: number
  start_date: string
  phases: Array<{ name: string; week_range: [number, number]; focus: string; intensity: string }>
  week_plan: WeekPlan
}

export function validateProgram(program: ProgramInput): { valid: boolean; errors: string[]; normalized: ProgramInput } {
  const errors: string[] = []
  const normalized = JSON.parse(JSON.stringify(program)) as ProgramInput

  // Normalise exercise names
  for (const week of Object.values(normalized.week_plan)) {
    for (const day of Object.values(week)) {
      if (!day.exercises) continue
      day.exercises = day.exercises.map((ex: PrescribedExercise) => ({
        ...ex,
        name: EXERCISE_ALIASES[ex.name] ?? ex.name,
      }))
    }
  }

  // Check weekly volume per muscle group (≤ 30 sets)
  for (const [weekKey, week] of Object.entries(normalized.week_plan)) {
    const groupSets: Record<string, number> = {}
    for (const day of Object.values(week)) {
      for (const ex of (day.exercises ?? [])) {
        const group = MUSCLE_GROUP[ex.name] ?? 'other'
        groupSets[group] = (groupSets[group] ?? 0) + ex.sets
      }
    }
    for (const [group, total] of Object.entries(groupSets)) {
      if (total > 30) {
        errors.push(`Week ${weekKey}: ${group} has ${total} sets (max 30)`)
      }
    }
  }

  return { valid: errors.length === 0, errors, normalized }
}
```

**Step 4: Update `create_program` tool** in `src/lib/agent/tools.ts` to call `validateProgram` before inserting:

```ts
// At top of tools.ts, add import:
import { validateProgram } from '@/lib/agent/validateProgram'

// Inside create_program execute(), before the supabase insert, add:
const validation = validateProgram({ goal, duration_weeks, start_date, phases, week_plan })
if (!validation.valid) {
  return { success: false, validationErrors: validation.errors }
}
// Use validation.normalized.week_plan for the insert (has normalised names)
const normalizedWeekPlan = validation.normalized.week_plan
```

**Step 5: Run tests — expect pass.**

```bash
pnpm test -- validateProgram
```

**Step 6: Commit.**

```bash
git add src/lib/agent/validateProgram.ts src/lib/agent/__tests__/validateProgram.test.ts src/lib/agent/tools.ts
git commit -m "feat: add validateProgram with alias normalisation and volume checks"
```

---

### Amendment F — generate-program route: preview + revision loop (replaces Task 7 Step 1)

The route now supports a two-phase flow: `action: 'generate'` streams a plan preview; `action: 'confirm'` commits to DB.

Create `src/app/api/trainer/generate-program/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { generateText, streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'
import { format } from 'date-fns'

const PREVIEW_SYSTEM = `You are an expert strength coach. The user wants a new training program.
1. Call get_user_profile and get_workout_history({ days: 60 }) in parallel (this returns a PerformanceSummary, not raw data — use it to gauge current capacity)
2. Design a full periodized block: 2–3 named phases, week-by-week exercise prescription
3. Return ONLY a JSON object (no markdown fences) in this exact shape:
{
  "preview": {
    "phases": [{ "name": string, "week_range": [n, n], "focus": string, "top_exercises": string[] }],
    "duration_weeks": number,
    "sessions_per_week": number,
    "notes": string
  },
  "program": { /* full ProgramInput ready for create_program */ }
}
Do not call create_program yet. The user will review the preview first.`

const COMMIT_SYSTEM = `You are an expert strength coach. The user has approved (or given feedback on) a training program draft.
Given the original program JSON and any user feedback, either commit it as-is or incorporate the feedback and commit.
1. If feedback is provided, revise the program accordingly
2. Call create_program with the final program
3. Call add_trainer_message with type "check_in" and a warm welcome + week 1 summary`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    action?: 'generate' | 'confirm' | 'revise'
    feedback?: string
    draftProgram?: object
    goal?: string
    durationWeeks?: number
  }

  const action = body.action ?? 'generate'
  const tools = createAgentTools(supabase, user.id)

  if (action === 'generate' || action === 'revise') {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    try {
      const { text } = await generateText({
        model: agentModel,
        system: PREVIEW_SYSTEM + `\nToday: ${format(new Date(), 'yyyy-MM-dd')}. Goal: ${body.goal ?? 'hypertrophy'}. Duration: ${body.durationWeeks ?? 8} weeks.${body.feedback ? `\nUser feedback on previous draft: ${body.feedback}` : ''}`,
        messages: [{ role: 'user', content: body.feedback ? `Revise the program based on my feedback: ${body.feedback}` : 'Generate my program now.' }],
        tools: { get_user_profile: tools.get_user_profile, get_workout_history: tools.get_workout_history },
        maxSteps: 3,
        abortSignal: controller.signal,
      })
      clearTimeout(timeout)

      let parsed: { preview: object; program: object }
      try {
        parsed = JSON.parse(text)
      } catch {
        return NextResponse.json({ error: 'Agent returned malformed JSON' }, { status: 500 })
      }
      return NextResponse.json({ preview: parsed.preview, draftProgram: parsed.program })
    } catch (error) {
      clearTimeout(timeout)
      return NextResponse.json({ error: 'timeout' }, { status: 504 })
    }
  }

  // action === 'confirm'
  if (!body.draftProgram) return NextResponse.json({ error: 'draftProgram required' }, { status: 400 })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    await generateText({
      model: agentModel,
      system: COMMIT_SYSTEM,
      messages: [{
        role: 'user',
        content: `Commit this program to the database:\n\`\`\`json\n${JSON.stringify(body.draftProgram)}\`\`\`${body.feedback ? `\n\nUser asked to change: ${body.feedback}` : ''}`,
      }],
      tools,
      maxSteps: 6,
      abortSignal: controller.signal,
    })
    clearTimeout(timeout)
    return NextResponse.json({ success: true })
  } catch (error) {
    clearTimeout(timeout)
    return NextResponse.json({ error: 'timeout' }, { status: 504 })
  }
}
```

---

### Amendment G — Goal-setting screen: 4 steps (replaces Task 8 Step 1)

Update `src/app/onboarding/goals/page.tsx` to add Step 3 (Review & Edit) and rename the current Step 3 to Step 4.

Key state additions:
```ts
type Step = 1 | 2 | 3 | 4
const [step, setStep] = useState<Step>(1)
const [preview, setPreview] = useState<PlanPreview | null>(null)
const [draftProgram, setDraftProgram] = useState<object | null>(null)
const [revisionFeedback, setRevisionFeedback] = useState('')
const [revisionCount, setRevisionCount] = useState(0)
const [revising, setRevising] = useState(false)

interface PlanPreview {
  phases: Array<{ name: string; week_range: [number, number]; focus: string; top_exercises: string[] }>
  duration_weeks: number
  sessions_per_week: number
  notes: string
}
```

Step 2 "next" button now calls the generate endpoint to get a preview before advancing to Step 3:
```ts
async function handlePreviewGenerate() {
  setGenerating(true)
  const res = await fetch('/api/trainer/generate-program', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'generate', goal, durationWeeks }),
  })
  const data = await res.json()
  setPreview(data.preview)
  setDraftProgram(data.draftProgram)
  setGenerating(false)
  setStep(3)
}
```

Step 3 renders `<PlanPreviewCard preview={preview} />` (new component — see Amendment I) plus a textarea for feedback and two buttons:
- **"Looks good, start my program"** → calls `handleConfirm()`
- **"Request changes"** (only if `revisionCount < 3`) → calls `handleRevise()`

```ts
async function handleRevise() {
  setRevising(true)
  const res = await fetch('/api/trainer/generate-program', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'revise', goal, durationWeeks, feedback: revisionFeedback, draftProgram }),
  })
  const data = await res.json()
  setPreview(data.preview)
  setDraftProgram(data.draftProgram)
  setRevisionFeedback('')
  setRevisionCount(c => c + 1)
  setRevising(false)
}

async function handleConfirm() {
  setGenerating(true)
  await fetch('/api/trainer/generate-program', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'confirm', draftProgram }),
  })
  setGenerating(false)
  setStep(4)
}
```

Step 4 is the success screen — "Your program is ready!" — with a "Go to Dashboard" button.

The progress segments bar should show 4 segments:
```ts
const progressSegments = [step >= 1, step >= 2, step >= 3, step >= 4]
```

---

### Amendment H — suggest-workout: localDate (replaces Task 10 Step 1 cache key logic)

The route must accept `localDate` from the request body and use it for the `ai_suggestions` cache key:

```ts
// In POST handler, after auth:
const body = await req.json().catch(() => ({})) as { localDate?: string }
const localDate = body.localDate ?? format(new Date(), 'yyyy-MM-dd')

// All ai_suggestions queries use localDate instead of new Date():
// Check cache:
const { data: cached } = await supabase
  .from('ai_suggestions')
  .select('suggestion')
  .eq('user_id', user.id)
  .eq('date', localDate)
  .single()

// Upsert uses localDate:
await supabase.from('ai_suggestions').upsert({ user_id: user.id, date: localDate, suggestion: workout })
```

Client-side calls to `suggest-workout` must include `localDate`:
```ts
const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone
const localDate = new Date().toLocaleDateString('en-CA', { timeZone: userTz })
await fetch('/api/suggest-workout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ localDate }),
})
```

---

### Amendment I — New Task: RpeSelector + PlanPreviewCard components

**New file: `src/components/RpeSelector.tsx`**

```tsx
'use client'

interface Props {
  value: number | null
  onChange: (rpe: number) => void
}

const RPE_LABELS: Record<number, string> = {
  1: 'Very easy', 2: 'Easy', 3: 'Moderate', 4: 'Somewhat hard', 5: 'Hard',
  6: 'Harder', 7: 'Very hard', 8: 'Very very hard', 9: 'Near max', 10: 'Max effort',
}

export function RpeSelector({ value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-xs">
      <p className="font-body-sm text-on-surface-variant text-xs uppercase tracking-widest">
        Effort (RPE)
      </p>
      <div className="flex gap-1 flex-wrap">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`w-8 h-8 rounded text-xs font-mono font-bold transition-colors ${
              value === n
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'
            }`}
            title={RPE_LABELS[n]}
          >
            {n}
          </button>
        ))}
      </div>
      {value != null && (
        <p className="text-xs text-on-surface-variant">{RPE_LABELS[value]}</p>
      )}
    </div>
  )
}
```

Wire it into `src/app/workout/[id]/page.tsx` — add it below each completed set row, persisted to `workout_exercises.perceived_effort` alongside the existing set save logic.

**New file: `src/components/PlanPreviewCard.tsx`**

```tsx
interface PlanPreview {
  phases: Array<{ name: string; week_range: [number, number]; focus: string; top_exercises: string[] }>
  duration_weeks: number
  sessions_per_week: number
  notes: string
}

export function PlanPreviewCard({ preview }: { preview: PlanPreview }) {
  return (
    <div className="bg-surface-container-high rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-headline text-primary-container text-sm uppercase tracking-wider">
          Your {preview.duration_weeks}-Week Program
        </p>
        <p className="text-xs text-on-surface-variant">{preview.sessions_per_week}×/week</p>
      </div>
      <div className="flex flex-col gap-2">
        {preview.phases.map((phase, i) => (
          <div key={i} className="bg-surface-container rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <p className="font-body-sm text-on-surface font-semibold">{phase.name}</p>
              <p className="text-xs text-on-surface-variant">
                Wk {phase.week_range[0]}–{phase.week_range[1]}
              </p>
            </div>
            <p className="text-xs text-on-surface-variant mb-1 capitalize">{phase.focus}</p>
            <p className="text-xs text-on-surface-variant/70">{phase.top_exercises.join(' · ')}</p>
          </div>
        ))}
      </div>
      {preview.notes && (
        <p className="text-xs text-on-surface-variant italic">{preview.notes}</p>
      )}
    </div>
  )
}
```

---

### Amendment J — Trainer tab: reviewing state banner (extends Task 15)

In `src/app/trainer/page.tsx`, fetch the active `program_weeks` row and render a banner based on its status. Add this above the chat thread, below the program summary card:

```tsx
// In the load function, also fetch:
const { data: activeWeek } = await supabase
  .from('program_weeks')
  .select('status, updated_at')
  .eq('user_id', user.id)
  .in('status', ['active', 'reviewing'])
  .order('week_start', { ascending: false })
  .limit(1)
  .single()
```

```tsx
// Render banner (client component):
{activeWeek?.status === 'reviewing' && (
  (() => {
    const isStale = activeWeek.updated_at
      ? Date.now() - new Date(activeWeek.updated_at).getTime() > 10 * 60 * 1000
      : false
    return isStale ? (
      <div className="bg-surface-container-high rounded-xl p-3 flex items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">Review didn't finish.</p>
        <button
          onClick={async () => {
            await fetch('/api/trainer/review-week/reset', { method: 'PATCH' })
            router.refresh()
          }}
          className="text-xs text-primary-container font-semibold"
        >
          Retry Review
        </button>
      </div>
    ) : (
      <div className="bg-surface-container-high rounded-xl p-3 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
        <p className="text-sm text-on-surface-variant">Your trainer is reviewing last week…</p>
      </div>
    )
  })()
)}
```

---

### Amendment K — review-week route: state machine (replaces Task 19 Step 1)

Replace the `reviewed_at` optimistic lock with a `reviewing` status transition. Also add a `PATCH /api/trainer/review-week/reset` endpoint in the same directory.

`src/app/api/trainer/review-week/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'

const SYSTEM_PROMPT = `You are a strength coach performing a weekly training review.
1. Call get_current_program to get the current program and this week's data
2. Call get_workout_history({ days: 7 }) to get actual performance data (raw sets — ≤14 days)
3. Compare prescribed vs actual: volume (sets × reps), adherence, weight progression, and RPE trends
4. Decide on adjustments for next week: increase load if on track + low RPE, reduce volume if overreaching (high RPE), substitute if equipment issue
5. Call adjust_program_week for the NEXT week number with your adjustments and detailed reasoning
6. Call add_trainer_message with type "weekly_review" and a summary: adherence %, key lifts progress, what's changing next week and why. Under 200 words.`

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Find active week that hasn't been reviewed yet
  const { data: activeWeek } = await supabase
    .from('program_weeks')
    .select('id, program_id, week_number, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!activeWeek) {
    return NextResponse.json({ skipped: true, reason: 'no active week' })
  }

  // Atomically transition to 'reviewing' — concurrent requests will find status !== 'active'
  const { error: claimError } = await supabase
    .from('program_weeks')
    .update({ status: 'reviewing', updated_at: new Date().toISOString() })
    .eq('id', activeWeek.id)
    .eq('status', 'active') // only succeeds if still 'active'

  if (claimError) {
    return NextResponse.json({ skipped: true, reason: 'already claimed' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  try {
    await generateText({
      model: agentModel,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Perform the weekly review now.' }],
      tools: createAgentTools(supabase, user.id),
      maxSteps: 4,
      abortSignal: controller.signal,
    })
    clearTimeout(timeout)

    await supabase
      .from('program_weeks')
      .update({ status: 'completed', reviewed_at: new Date().toISOString() })
      .eq('id', activeWeek.id)

    await supabase
      .from('program_weeks')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('program_id', activeWeek.program_id)
      .eq('week_number', activeWeek.week_number + 1)

    return NextResponse.json({ success: true })
  } catch (error) {
    clearTimeout(timeout)
    // Row stays 'reviewing' — the Trainer tab will show the retry button after 10 min
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json({ error: isTimeout ? 'timeout' : 'failed' }, { status: 500 })
  }
}
```

`src/app/api/trainer/review-week/reset/route.ts` (new file):

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('program_weeks')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'reviewing')

  return NextResponse.json({ success: !error })
}
```

---

### Amendment L — Dashboard: date-change detection in visibilitychange (extends Task 11)

In `src/app/dashboard/page.tsx`, update the `visibilitychange` handler:

```ts
// When mounting, store the current local date
const [lastLoadDate, setLastLoadDate] = useState(() =>
  new Date().toLocaleDateString('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
)

useEffect(() => {
  function handleVisibility() {
    if (document.visibilityState !== 'visible') return
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const today = new Date().toLocaleDateString('en-CA', { timeZone: userTz })
    if (today !== lastLoadDate) {
      setLastLoadDate(today)
      loadSuggestion(today)
    }
  }
  document.addEventListener('visibilitychange', handleVisibility)
  return () => document.removeEventListener('visibilitychange', handleVisibility)
}, [lastLoadDate])
```

Where `loadSuggestion(localDate: string)` passes `localDate` in the POST body to `suggest-workout`.

---

**End of Amendments.** All original tasks below remain valid unless explicitly overridden above.

---

## File Map

**Create:**
- `supabase/migrations/005_agentic_trainer.sql` — all 4 schema migrations
- `src/lib/progressiveOverload.ts` — pure TS overload calculator
- `src/lib/__tests__/progressiveOverload.test.ts` — tests for above
- `src/lib/agent/client.ts` — exports `agentModel` (Claude Sonnet) and `fastModel` (DeepSeek)
- `src/lib/agent/tools.ts` — exports `createAgentTools(supabase, userId)` factory
- `src/app/api/trainer/generate-program/route.ts` — program generation agent route
- `src/app/api/trainer/chat/route.ts` — trainer chat streaming route
- `src/app/api/trainer/review-week/route.ts` — weekly review agent route
- `src/app/onboarding/goals/page.tsx` — goal-setting screen (step 4 of onboarding)
- `src/app/trainer/page.tsx` — trainer chat tab
- `src/components/ProgramCard.tsx` — program progress display
- `src/components/CoachingCard.tsx` — dismissible coaching insight card
- `src/components/TrainerChatThread.tsx` — message list + streamed input

**Modify:**
- `package.json` — add `ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, `zod`
- `src/lib/types.ts` — add `TrainingProgram`, `ProgramWeek`, `TrainerMessage`, `PrimaryGoal`
- `src/app/api/suggest-workout/route.ts` — read from `training_programs` when active; fallback to existing LLM path
- `src/app/dashboard/page.tsx` — fix Start Workout bug; add visibilitychange; add CoachingCards + ProgramCard; remove weekly plan section
- `src/app/onboarding/page.tsx` — redirect to `/onboarding/goals` after equipment step
- `src/app/workout/[id]/page.tsx` — show prescribed targets above ExerciseLogger; pre-fill weight
- `src/app/api/session-chat/route.ts` — upgrade to multi-turn using trainer_messages context + streaming
- `src/components/BottomNav.tsx` — add Trainer tab (4th item) with unread badge
- `src/components/WorkoutCard.tsx` — change "SUGGESTED" badge to "PRESCRIBED" when program is active

---

## Milestone 1: Foundation

### Task 1: Install dependencies and add env var

**Files:**
- Modify: `package.json`
- Modify: `.env.local` (instruction only — never committed)

- [ ] **Step 1: Install packages**

```bash
cd /Users/prasanthp/Documents/Work/AIgency/gym_trainer
pnpm add ai @ai-sdk/anthropic @ai-sdk/openai zod
```

Expected output: packages added, no peer-dep errors.

- [ ] **Step 2: Verify install**

```bash
pnpm list ai @ai-sdk/anthropic @ai-sdk/openai zod
```

Expected: each package listed with a version.

- [ ] **Step 3: Add ANTHROPIC_API_KEY to .env.local**

Add this line to `.env.local` (create if missing):
```
ANTHROPIC_API_KEY=sk-ant-...your-key...
```

The Vercel AI SDK `@ai-sdk/anthropic` reads this env var automatically.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat: add Vercel AI SDK, anthropic + openai providers, zod"
```

---

### Task 2: Write and apply DB migrations

**Files:**
- Create: `supabase/migrations/005_agentic_trainer.sql`

- [ ] **Step 1: Write migration file**

Create `supabase/migrations/005_agentic_trainer.sql`:

```sql
-- Migration 1: Add goal fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS primary_goal text
    CHECK (primary_goal IN ('hypertrophy','strength','fat_loss','endurance','general_fitness')),
  ADD COLUMN IF NOT EXISTS goal_duration_weeks int,
  ADD COLUMN IF NOT EXISTS goal_set_at timestamptz;

-- Migration 2: training_programs
CREATE TABLE IF NOT EXISTS training_programs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal           text NOT NULL,
  duration_weeks int NOT NULL,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','completed','paused')),
  phases         jsonb NOT NULL,
  week_plan      jsonb NOT NULL,
  model_used     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE training_programs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'training_programs' AND policyname = 'users own programs'
  ) THEN
    CREATE POLICY "users own programs"
      ON training_programs FOR ALL
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Migration 3: program_weeks
CREATE TABLE IF NOT EXISTS program_weeks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id       uuid NOT NULL REFERENCES training_programs(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_number      int NOT NULL,
  week_start       date NOT NULL,
  prescribed       jsonb,
  actual           jsonb,
  adjustment_notes text,
  status           text NOT NULL DEFAULT 'upcoming'
                     CHECK (status IN ('upcoming','active','completed','adjusted')),
  reviewed_at      timestamptz,
  UNIQUE (program_id, week_number)
);

ALTER TABLE program_weeks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'program_weeks' AND policyname = 'users own program weeks'
  ) THEN
    CREATE POLICY "users own program weeks"
      ON program_weeks FOR ALL
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Migration 4: trainer_messages
CREATE TABLE IF NOT EXISTS trainer_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role         text NOT NULL CHECK (role IN ('trainer','user')),
  content      text NOT NULL,
  message_type text NOT NULL DEFAULT 'chat'
                 CHECK (message_type IN ('chat','check_in','program_adjustment','session_feedback','weekly_review')),
  metadata     jsonb,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE trainer_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'trainer_messages' AND policyname = 'users own messages'
  ) THEN
    CREATE POLICY "users own messages"
      ON trainer_messages FOR ALL
      USING (user_id = auth.uid());
  END IF;
END $$;
```

- [ ] **Step 2: Apply migration in Supabase dashboard**

Go to Supabase dashboard → SQL editor → paste and run the migration. Verify all 4 tables/columns exist under Table Editor.

- [ ] **Step 3: Commit migration file**

```bash
git add supabase/migrations/005_agentic_trainer.sql
git commit -m "feat: add training_programs, program_weeks, trainer_messages migrations"
```

---

### Task 3: Add new types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write failing test** (type-check only — run tsc)

```bash
cd /Users/prasanthp/Documents/Work/AIgency/gym_trainer
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: either clean or existing errors only (none from missing types yet).

- [ ] **Step 2: Add types to `src/lib/types.ts`**

Append to the end of `src/lib/types.ts`:

```ts
export type PrimaryGoal = 'hypertrophy' | 'strength' | 'fat_loss' | 'endurance' | 'general_fitness'

export interface TrainingProgram {
  id: string
  user_id: string
  goal: PrimaryGoal
  duration_weeks: number
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'paused'
  phases: ProgramPhase[]
  week_plan: WeekPlan
  model_used: string | null
  created_at: string
}

export interface ProgramPhase {
  name: string
  week_range: [number, number]
  focus: string
  intensity: string
}

export type WeekPlan = Record<string, Record<string, DaySlot>>

export interface DaySlot {
  focus: DayFocus
  exercises?: PrescribedExercise[]
}

export interface PrescribedExercise {
  name: string
  sets: number
  reps: number
  weight_kg?: number
}

export interface ProgramWeek {
  id: string
  program_id: string
  user_id: string
  week_number: number
  week_start: string
  prescribed: WeekPlan | null
  actual: Record<string, unknown> | null
  adjustment_notes: string | null
  status: 'upcoming' | 'active' | 'completed' | 'adjusted'
  reviewed_at: string | null
}

export interface TrainerMessage {
  id: string
  user_id: string
  role: 'trainer' | 'user'
  content: string
  message_type: 'chat' | 'check_in' | 'program_adjustment' | 'session_feedback' | 'weekly_review'
  metadata: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}
```

- [ ] **Step 3: Run type-check**

```bash
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add TrainingProgram, ProgramWeek, TrainerMessage types"
```

---

### Task 4: Implement `calculateProgressiveOverload` (TDD)

**Files:**
- Create: `src/lib/progressiveOverload.ts`
- Create: `src/lib/__tests__/progressiveOverload.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/progressiveOverload.test.ts`:

```ts
import { calculateProgressiveOverload } from '@/lib/progressiveOverload'

describe('calculateProgressiveOverload', () => {
  it('returns prescribed weight with low confidence when no history', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Bench Press',
      targetSets: 4,
      targetReps: 8,
      history: [],
      prescribedWeight: 80,
    })
    expect(result.recommended_weight_kg).toBe(80)
    expect(result.confidence).toBe('low')
    expect(result.basis).toMatch(/no history/)
  })

  it('returns 0 with low confidence when no history and no prescribed weight', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Bench Press',
      targetSets: 4,
      targetReps: 8,
      history: [],
    })
    expect(result.recommended_weight_kg).toBe(0)
    expect(result.confidence).toBe('low')
  })

  it('increments by 2.5kg when 2+ consecutive sessions all hit target reps', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Bench Press',
      targetSets: 4,
      targetReps: 8,
      history: [
        { weight_kg: 80, reps: 9, date: '2026-05-11' },
        { weight_kg: 80, reps: 8, date: '2026-05-08' },
      ],
    })
    expect(result.recommended_weight_kg).toBe(82.5)
    expect(result.confidence).toBe('high')
  })

  it('maintains weight when only the last session hit target reps', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Bench Press',
      targetSets: 4,
      targetReps: 8,
      history: [
        { weight_kg: 80, reps: 8, date: '2026-05-11' },
        { weight_kg: 80, reps: 6, date: '2026-05-08' },
      ],
    })
    expect(result.recommended_weight_kg).toBe(80)
    expect(result.confidence).toBe('medium')
  })

  it('maintains weight when last session missed target reps', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Bench Press',
      targetSets: 4,
      targetReps: 8,
      history: [{ weight_kg: 80, reps: 5, date: '2026-05-11' }],
    })
    expect(result.recommended_weight_kg).toBe(80)
    expect(result.confidence).toBe('medium')
  })

  it('ignores history entries with null weight_kg', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Running',
      targetSets: 1,
      targetReps: 1,
      history: [{ weight_kg: null, reps: null, date: '2026-05-11' }],
      prescribedWeight: 0,
    })
    expect(result.recommended_weight_kg).toBe(0)
    expect(result.confidence).toBe('low')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- progressiveOverload
```

Expected: FAIL — `Cannot find module '@/lib/progressiveOverload'`

- [ ] **Step 3: Implement the function**

Create `src/lib/progressiveOverload.ts`:

```ts
export type OverloadResult = {
  recommended_weight_kg: number
  basis: string
  confidence: 'high' | 'medium' | 'low'
}

export type ExerciseHistoryEntry = {
  weight_kg: number | null
  reps: number | null
  date: string
}

export function calculateProgressiveOverload(params: {
  exerciseName: string
  targetSets: number
  targetReps: number
  history: ExerciseHistoryEntry[]
  prescribedWeight?: number | null
}): OverloadResult {
  const { targetReps, history, prescribedWeight } = params

  const valid = history
    .filter(h => h.weight_kg !== null && h.weight_kg > 0 && h.reps !== null)
    .slice(0, 3)

  if (valid.length === 0) {
    return {
      recommended_weight_kg: prescribedWeight ?? 0,
      basis: prescribedWeight != null
        ? 'no history — using prescribed weight'
        : 'no history or prescription',
      confidence: 'low',
    }
  }

  const lastWeight = valid[0].weight_kg!
  const allHitTarget = valid.every(h => (h.reps ?? 0) >= targetReps)

  if (allHitTarget && valid.length >= 2) {
    return {
      recommended_weight_kg: lastWeight + 2.5,
      basis: `${valid.length} consecutive sessions at ${lastWeight}kg hitting ${targetReps}+ reps — progress`,
      confidence: 'high',
    }
  }

  if ((valid[0].reps ?? 0) >= targetReps) {
    return {
      recommended_weight_kg: lastWeight,
      basis: `hit target last session — maintain ${lastWeight}kg`,
      confidence: 'medium',
    }
  }

  return {
    recommended_weight_kg: lastWeight,
    basis: `below target reps last session (${valid[0].reps}/${targetReps}) — maintain ${lastWeight}kg`,
    confidence: 'medium',
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- progressiveOverload
```

Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/progressiveOverload.ts src/lib/__tests__/progressiveOverload.test.ts
git commit -m "feat: add calculateProgressiveOverload with tests"
```

---

### Task 5: Set up AI model client

**Files:**
- Create: `src/lib/agent/client.ts`

- [ ] **Step 1: Create `src/lib/agent/client.ts`**

```ts
import { anthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'

export const agentModel = anthropic('claude-sonnet-4-6')

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
})

export const fastModel = openrouter(
  process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'
)
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep -E "agent/client|error" | head -10
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/client.ts
git commit -m "feat: add AI model client (Claude Sonnet + DeepSeek via OpenRouter)"
```

---

### Task 6: Implement agent tools

**Files:**
- Create: `src/lib/agent/tools.ts`

- [ ] **Step 1: Create `src/lib/agent/tools.ts`**

```ts
import { tool } from 'ai'
import { z } from 'zod'
import { addDays, format, parseISO } from 'date-fns'
import { calculateProgressiveOverload } from '@/lib/progressiveOverload'
import type { SupabaseClient } from '@supabase/supabase-js'

export function createAgentTools(supabase: SupabaseClient, userId: string) {
  return {
    get_user_profile: tool({
      description: 'Get the authenticated user profile and their equipment list',
      parameters: z.object({}),
      execute: async () => {
        const [{ data: profile }, { data: equipment }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          supabase.from('user_equipment').select('*').eq('user_id', userId),
        ])
        return { profile, equipment: equipment ?? [] }
      },
    }),

    get_workout_history: tool({
      description: 'Get recent workouts with their exercises',
      parameters: z.object({ days: z.number().int().min(1).max(90) }),
      execute: async ({ days }) => {
        const since = format(addDays(new Date(), -days), 'yyyy-MM-dd')
        const { data } = await supabase
          .from('workouts')
          .select('*, workout_exercises(*)')
          .eq('user_id', userId)
          .gte('date', since)
          .order('date', { ascending: false })
        return { workouts: data ?? [] }
      },
    }),

    get_current_program: tool({
      description: 'Get the active training program and the current active program_weeks row',
      parameters: z.object({}),
      execute: async () => {
        const { data: program } = await supabase
          .from('training_programs')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!program) return { program: null, activeWeek: null }

        const { data: activeWeek } = await supabase
          .from('program_weeks')
          .select('*')
          .eq('program_id', program.id)
          .eq('status', 'active')
          .single()

        return { program, activeWeek: activeWeek ?? null }
      },
    }),

    get_exercise_performance: tool({
      description: 'Get historical logged sets for one exercise, newest first',
      parameters: z.object({ exercise_name: z.string() }),
      execute: async ({ exercise_name }) => {
        const { data } = await supabase
          .from('workout_exercises')
          .select('weight_kg, reps, sets, workouts!inner(date, user_id)')
          .eq('workouts.user_id', userId)
          .eq('exercise_name', exercise_name)
          .order('created_at', { ascending: false })
          .limit(10)
        return { sets: data ?? [] }
      },
    }),

    calculate_progressive_overload: tool({
      description: 'Calculate recommended weight for an exercise based on history and targets',
      parameters: z.object({
        exercise_name: z.string(),
        target_sets: z.number().int(),
        target_reps: z.number().int(),
      }),
      execute: async ({ exercise_name, target_sets, target_reps }) => {
        const { data } = await supabase
          .from('workout_exercises')
          .select('weight_kg, reps, workouts!inner(date, user_id)')
          .eq('workouts.user_id', userId)
          .eq('exercise_name', exercise_name)
          .order('created_at', { ascending: false })
          .limit(6)

        const history = (data ?? []).map((row: { weight_kg: number | null; reps: number | null; workouts: { date: string } }) => ({
          weight_kg: row.weight_kg,
          reps: row.reps,
          date: row.workouts.date,
        }))

        return calculateProgressiveOverload({
          exerciseName: exercise_name,
          targetSets: target_sets,
          targetReps: target_reps,
          history,
        })
      },
    }),

    create_program: tool({
      description: 'Create a new training program and seed program_weeks rows. Call this once after designing the full block.',
      parameters: z.object({
        goal: z.enum(['hypertrophy', 'strength', 'fat_loss', 'endurance', 'general_fitness']),
        duration_weeks: z.number().int().min(4).max(16),
        start_date: z.string().describe('ISO date, e.g. 2026-05-12'),
        phases: z.array(z.object({
          name: z.string(),
          week_range: z.tuple([z.number(), z.number()]),
          focus: z.string(),
          intensity: z.string(),
        })),
        week_plan: z.record(z.record(z.object({
          focus: z.string(),
          exercises: z.array(z.object({
            name: z.string(),
            sets: z.number().int(),
            reps: z.number().int(),
            weight_kg: z.number().optional(),
          })).optional(),
        }))),
      }),
      execute: async ({ goal, duration_weeks, start_date, phases, week_plan }) => {
        const startDate = parseISO(start_date)
        const endDate = addDays(startDate, duration_weeks * 7 - 1)

        const { data: program, error } = await supabase
          .from('training_programs')
          .insert({
            user_id: userId,
            goal,
            duration_weeks,
            start_date,
            end_date: format(endDate, 'yyyy-MM-dd'),
            status: 'active',
            phases,
            week_plan,
            model_used: 'claude-sonnet-4-6',
          })
          .select()
          .single()

        if (error || !program) return { success: false, error: error?.message }

        // Deactivate any previous active programs
        await supabase
          .from('training_programs')
          .update({ status: 'paused' })
          .eq('user_id', userId)
          .eq('status', 'active')
          .neq('id', program.id)

        // Seed program_weeks
        const weekRows = Array.from({ length: duration_weeks }, (_, i) => ({
          program_id: program.id,
          user_id: userId,
          week_number: i + 1,
          week_start: format(addDays(startDate, i * 7), 'yyyy-MM-dd'),
          status: i === 0 ? 'active' : 'upcoming',
          prescribed: week_plan[String(i + 1)] ?? null,
        }))

        await supabase.from('program_weeks').insert(weekRows)

        // Update profile goal fields
        await supabase
          .from('profiles')
          .update({ primary_goal: goal, goal_duration_weeks: duration_weeks, goal_set_at: new Date().toISOString() })
          .eq('id', userId)

        return { success: true, programId: program.id }
      },
    }),

    adjust_program_week: tool({
      description: 'Adjust a program week with modified exercises or load. Used during weekly review or when user requests a change.',
      parameters: z.object({
        week_number: z.number().int(),
        adjustments: z.record(z.unknown()).describe('Partial week_plan override for this week'),
        reasoning: z.string(),
      }),
      execute: async ({ week_number, adjustments, reasoning }) => {
        const { data: program } = await supabase
          .from('training_programs')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active')
          .single()

        if (!program) return { success: false, error: 'no active program' }

        const { error } = await supabase
          .from('program_weeks')
          .update({ adjustment_notes: reasoning, status: 'adjusted', prescribed: adjustments })
          .eq('program_id', program.id)
          .eq('week_number', week_number)

        return { success: !error, error: error?.message }
      },
    }),

    add_trainer_message: tool({
      description: 'Insert a trainer message into the conversation history. Always call this to save your reply.',
      parameters: z.object({
        content: z.string(),
        type: z.enum(['chat', 'check_in', 'program_adjustment', 'session_feedback', 'weekly_review']).default('chat'),
        metadata: z.record(z.unknown()).optional(),
      }),
      execute: async ({ content, type, metadata }) => {
        const { error } = await supabase.from('trainer_messages').insert({
          user_id: userId,
          role: 'trainer',
          content,
          message_type: type,
          metadata: metadata ?? null,
        })
        return { success: !error }
      },
    }),

    get_trainer_history: tool({
      description: 'Get past trainer messages for conversation context, newest first',
      parameters: z.object({ limit: z.number().int().min(1).max(50) }),
      execute: async ({ limit }) => {
        const { data } = await supabase
          .from('trainer_messages')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit)
        return { messages: (data ?? []).reverse() }
      },
    }),
  }
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep "agent/tools" | head -10
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/tools.ts
git commit -m "feat: add createAgentTools factory with full tool set"
```

---

### Task 7: Implement generate-program route

**Files:**
- Create: `src/app/api/trainer/generate-program/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/trainer/generate-program/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'
import { format } from 'date-fns'

const SYSTEM_PROMPT = `You are an expert strength and conditioning coach. You design evidence-based, periodized training programs tailored to the individual.

When asked to generate a program:
1. Call get_user_profile and get_workout_history({ days: 60 }) in parallel
2. Analyse the user's fitness level, equipment, current capacity, goal, and preferred training days
3. Design a full periodized block with 2-3 named phases. Each phase has a name, week range, focus, and intensity descriptor.
4. Write out the complete week_plan as a JSON object keyed by week number (as a string, e.g. "1"), then by day key ("mon","tue","wed","thu","fri","sat","sun"). Each day slot has a "focus" and an optional "exercises" array (each with name, sets, reps, weight_kg).
5. Call create_program with the complete program object. start_date should be today (${format(new Date(), 'yyyy-MM-dd')}).
6. Call add_trainer_message with type "check_in" and a warm welcome message that summarises the program: goal, duration, phase names, and what week 1 looks like.

Be prescriptive. Write actual exercise names, sets, reps, and starting weights based on the user's fitness level. Do not leave exercises empty.`

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    await generateText({
      model: agentModel,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Generate my training program now.' }],
      tools: createAgentTools(supabase, user.id),
      maxSteps: 4,
      abortSignal: controller.signal,
    })

    clearTimeout(timeout)

    const { data: program } = await supabase
      .from('training_programs')
      .select('*, program_weeks(*)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    return NextResponse.json({ success: true, program })
  } catch (error) {
    clearTimeout(timeout)
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json(
      { error: isTimeout ? 'Program generation timed out. Please try again.' : 'Failed to generate program.' },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep "generate-program" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/trainer/generate-program/route.ts
git commit -m "feat: add generate-program agent route"
```

---

### Task 8: Build goal-setting screen

**Files:**
- Create: `src/app/onboarding/goals/page.tsx`

- [ ] **Step 1: Create the goals page**

Create `src/app/onboarding/goals/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { PrimaryGoal } from '@/lib/types'

const GOALS: Array<{ value: PrimaryGoal; label: string; description: string; icon: string }> = [
  { value: 'hypertrophy', label: 'Hypertrophy', description: 'Build muscle size through volume-focused training.', icon: 'fitness_center' },
  { value: 'strength', label: 'Strength', description: 'Increase your 1RM on core lifts through progressive overload.', icon: 'exercise' },
  { value: 'fat_loss', label: 'Fat Loss', description: 'Preserve muscle while creating a caloric deficit through training.', icon: 'local_fire_department' },
  { value: 'endurance', label: 'Endurance', description: 'Improve cardiovascular capacity and muscular stamina.', icon: 'directions_run' },
  { value: 'general_fitness', label: 'General Fitness', description: 'Balanced all-round fitness — strength, cardio, and mobility.', icon: 'star' },
]

const DURATIONS: Array<{ weeks: number; label: string; sublabel: string }> = [
  { weeks: 4, label: '1 Month', sublabel: '4 weeks' },
  { weeks: 8, label: '2 Months', sublabel: '8 weeks' },
  { weeks: 12, label: '3 Months', sublabel: '12 weeks' },
]

const GOAL_DURATION_NOTES: Record<PrimaryGoal, string> = {
  hypertrophy: '8–12 weeks allows full hypertrophy phases (accumulation → intensification → peak).',
  strength: '12 weeks is optimal for strength peaking — allows a proper base and taper.',
  fat_loss: '4–8 weeks keeps intensity high enough to preserve muscle during a deficit.',
  endurance: '8–12 weeks builds aerobic base progressively without overtraining.',
  general_fitness: '4–8 weeks works well — enough time to see real progress across all qualities.',
}

type Step = 1 | 2 | 3

export default function GoalsPage() {
  const [step, setStep] = useState<Step>(1)
  const [goal, setGoal] = useState<PrimaryGoal>('hypertrophy')
  const [durationWeeks, setDurationWeeks] = useState(8)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = searchParams.get('returnTo') ?? '/dashboard'

  const progressSegments = [step >= 1, step >= 2, step >= 3]

  async function handleGenerate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/trainer/generate-program', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json() as { error?: string }
        throw new Error(body.error ?? 'Unknown error')
      }
      router.push(returnTo)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-surface/80 backdrop-blur-xl border-b border-white/[0.06] fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50">
        <div className="flex items-center justify-between px-margin h-14">
          {step > 1 && !generating ? (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="text-on-surface-variant hover:text-primary-container transition-colors p-1 -ml-1"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>
          ) : <div className="w-8" />}
          <h1 className="font-headline-lg text-[20px] text-primary-container uppercase tracking-wider font-bold">
            Elite Athlete
          </h1>
          <div className="w-8" />
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[88px] px-margin flex flex-col">
        <div className="flex gap-xs mb-lg mt-sm">
          {progressSegments.map((active, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${active ? 'bg-primary-container' : 'bg-surface-container-high'}`}
            />
          ))}
        </div>

        {step === 1 && (
          <div className="flex flex-col flex-grow">
            <div className="mb-lg">
              <p className="font-label-caps text-[11px] text-on-surface-variant/60 uppercase mb-xs tracking-widest">Step 1 of 3</p>
              <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Your Goal</h2>
              <p className="font-body-md text-[15px] text-on-surface-variant mt-xs">
                Your trainer will build the entire program around this.
              </p>
            </div>
            <div className="flex flex-col gap-xs flex-grow">
              {GOALS.map(g => (
                <button
                  key={g.value}
                  onClick={() => setGoal(g.value)}
                  className={`w-full text-left rounded-xl p-sm border transition-all duration-200 flex items-center justify-between ${
                    goal === g.value
                      ? 'border-primary-container/40 bg-surface-container'
                      : 'border-white/[0.06] bg-surface-container hover:border-white/[0.12]'
                  }`}
                >
                  <div className="flex-1">
                    <h3 className="font-headline-md text-[18px] text-on-surface uppercase mb-[2px]">{g.label}</h3>
                    <p className="font-body-md text-[14px] text-on-surface-variant">{g.description}</p>
                  </div>
                  <span className={`material-symbols-outlined text-[28px] ml-sm transition-colors ${goal === g.value ? 'text-primary-container' : 'text-on-surface-variant/30'}`}>
                    {g.icon}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col flex-grow">
            <div className="mb-lg">
              <p className="font-label-caps text-[11px] text-on-surface-variant/60 uppercase mb-xs tracking-widest">Step 2 of 3</p>
              <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Duration</h2>
              <p className="font-body-md text-[15px] text-on-surface-variant mt-xs">
                How long is this training block?
              </p>
            </div>
            <div className="flex flex-col gap-sm mb-md">
              {DURATIONS.map(d => (
                <button
                  key={d.weeks}
                  onClick={() => setDurationWeeks(d.weeks)}
                  className={`w-full text-left rounded-xl p-sm border transition-all duration-200 flex items-center justify-between ${
                    durationWeeks === d.weeks
                      ? 'border-primary-container/40 bg-surface-container'
                      : 'border-white/[0.06] bg-surface-container hover:border-white/[0.12]'
                  }`}
                >
                  <div>
                    <h3 className="font-headline-md text-[20px] text-on-surface uppercase">{d.label}</h3>
                    <p className="font-body-md text-[13px] text-on-surface-variant">{d.sublabel}</p>
                  </div>
                  <span className={`material-symbols-outlined text-[24px] transition-colors ${durationWeeks === d.weeks ? 'text-primary-container' : 'text-on-surface-variant/30'}`}>
                    {durationWeeks === d.weeks ? 'radio_button_checked' : 'radio_button_unchecked'}
                  </span>
                </button>
              ))}
            </div>
            <div className="bg-surface-container-high border border-white/[0.06] rounded-xl p-sm">
              <p className="font-body-md text-[13px] text-on-surface-variant">
                <span className="text-primary-container font-semibold">Trainer note: </span>
                {GOAL_DURATION_NOTES[goal]}
              </p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col flex-grow">
            <div className="mb-lg">
              <p className="font-label-caps text-[11px] text-on-surface-variant/60 uppercase mb-xs tracking-widest">Step 3 of 3</p>
              <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Confirm</h2>
            </div>
            <div className="bg-surface-container border border-white/[0.06] rounded-2xl p-md flex flex-col gap-sm mb-md">
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary-container text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>flag</span>
                <div>
                  <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest uppercase">Goal</p>
                  <p className="font-headline-md text-[18px] text-on-surface uppercase">{GOALS.find(g => g.value === goal)?.label}</p>
                </div>
              </div>
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-primary-container text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>calendar_month</span>
                <div>
                  <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest uppercase">Duration</p>
                  <p className="font-headline-md text-[18px] text-on-surface uppercase">{DURATIONS.find(d => d.weeks === durationWeeks)?.label} ({durationWeeks} weeks)</p>
                </div>
              </div>
            </div>

            {generating && (
              <div className="flex flex-col items-center gap-md py-lg">
                <div className="w-16 h-16 rounded-2xl bg-primary-container/10 border border-primary-container/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary-container text-[32px] animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
                </div>
                <p className="font-body-md text-[15px] text-on-surface-variant text-center">
                  Your trainer is designing your program…
                </p>
                <p className="font-label-caps text-[11px] text-on-surface-variant/50 tracking-widest uppercase text-center">
                  This takes about 15–20 seconds
                </p>
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-sm">
                <p className="font-body-md text-[13px] text-red-400">{error}</p>
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-surface/90 backdrop-blur-md p-margin border-t border-white/[0.06] z-40">
        <div className="flex justify-between items-center">
          {step > 1 && !generating ? (
            <button
              onClick={() => setStep((step - 1) as Step)}
              className="font-label-caps text-[12px] text-on-surface-variant hover:text-primary-container py-xs px-sm uppercase transition-colors tracking-wider"
            >
              Back
            </button>
          ) : <div />}

          {step < 3 ? (
            <button
              onClick={() => setStep((step + 1) as Step)}
              className="bg-primary-container text-on-primary-container font-label-caps text-[14px] py-sm px-lg rounded-xl uppercase tracking-wider hover:brightness-110 transition-all flex items-center gap-xs font-bold"
            >
              Next
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="bg-primary-container text-on-primary-container font-label-caps text-[14px] py-sm px-lg rounded-xl uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition-all flex items-center gap-xs font-bold"
            >
              {generating ? 'Generating…' : 'Generate My Program'}
              {!generating && <span className="material-symbols-outlined text-[18px]">bolt</span>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep "onboarding/goals" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/goals/page.tsx
git commit -m "feat: add goal-setting screen (/onboarding/goals)"
```

---

### Task 9: Wire onboarding to redirect to goals after equipment

**Files:**
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Update `handleFinish` in `src/app/onboarding/page.tsx`**

Replace the `handleFinish` function (lines 32–51):

```ts
async function handleFinish() {
  setSaving(true)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('profiles').upsert({
    id: user.id,
    fitness_level: fitnessLevel,
    days_per_week: daysPerWeek,
  })

  if (selectedEquipment.length > 0) {
    await supabase.from('user_equipment').insert(
      selectedEquipment.map(name => ({ user_id: user.id, equipment_name: name.toLowerCase() }))
    )
  }

  router.push('/onboarding/goals')
}
```

- [ ] **Step 2: Also add "Change Program" button to Profile page**

In `src/app/profile/page.tsx`, find the section with model options (or near the bottom of the profile form). Add a "Change Program" row before the sign-out button:

Read the profile page first to find the right insertion point. Look for the last section before the sign-out button, and add:

```tsx
<div className="bg-surface-container border border-white/[0.06] rounded-2xl overflow-hidden">
  <div className="px-md py-sm border-b border-white/[0.06]">
    <p className="font-label-caps text-[11px] text-on-surface-variant/60 tracking-widest uppercase">Training Program</p>
  </div>
  <div className="px-md py-sm flex items-center justify-between">
    <p className="font-body-md text-[14px] text-on-surface">Redesign your program</p>
    <Link
      href="/onboarding/goals?returnTo=/profile"
      className="font-label-caps text-[11px] text-primary-container hover:brightness-110 tracking-wider uppercase flex items-center gap-[4px]"
    >
      <span className="material-symbols-outlined text-[14px]">edit</span>
      Change Program
    </Link>
  </div>
</div>
```

Note: Read `src/app/profile/page.tsx` to find the exact insertion point before making this edit.

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboarding/page.tsx src/app/profile/page.tsx
git commit -m "feat: wire onboarding to goal-setting screen; add Change Program to profile"
```

---

## Milestone 2: Smart Sessions

### Task 10: Update suggest-workout to read from training_programs

**Files:**
- Modify: `src/app/api/suggest-workout/route.ts`

- [ ] **Step 1: Replace `src/app/api/suggest-workout/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callOpenRouter } from '@/lib/openrouter'
import { buildWorkoutPrompt, buildWeeklyPlanPrompt } from '@/lib/prompts'
import { format, startOfWeek, differenceInDays, parseISO } from 'date-fns'
import { calculateProgressiveOverload } from '@/lib/progressiveOverload'
import type {
  SuggestedWorkout,
  WorkoutExercise,
  Workout,
  WeeklyPlan,
  DayFocus,
  DayKey,
  TrainingProgram,
} from '@/lib/types'

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function dayKeyFor(date: Date): DayKey {
  return DAY_KEYS[date.getDay()]
}

function currentWeekNumber(program: TrainingProgram, today: Date): number {
  const start = parseISO(program.start_date)
  const daysSinceStart = differenceInDays(today, start)
  return Math.min(Math.ceil((daysSinceStart + 1) / 7), program.duration_weeks)
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const dayOfWeek = format(now, 'EEEE')
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const todayDayKey = dayKeyFor(now)

  const [{ data: profile }, { data: equipment }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('user_equipment').select('*').eq('user_id', user.id),
  ])

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Check for active training program
  const { data: program } = await supabase
    .from('training_programs')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (program) {
    // Program-based path
    const weekNum = currentWeekNumber(program as TrainingProgram, now)
    const weekSlots = (program.week_plan as Record<string, Record<string, { focus: string; exercises?: Array<{ name: string; sets: number; reps: number; weight_kg?: number }> }>>)[String(weekNum)]

    const todaySlot = weekSlots?.[todayDayKey]
    const focus = (todaySlot?.focus ?? 'rest') as DayFocus

    if (focus === 'rest' || !todaySlot) {
      return NextResponse.json({ rest: true, isProgramBased: true })
    }

    // Check cache
    const { data: cached } = await supabase
      .from('ai_suggestions')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .single()

    if (cached) {
      return NextResponse.json({ suggestion: cached.suggested_workout, isProgramBased: true })
    }

    // Build suggestion from prescribed exercises + progressive overload
    const exercises = todaySlot.exercises ?? []

    const resolvedExercises = await Promise.all(
      exercises.map(async ex => {
        if (!ex.sets || !ex.reps) {
          return {
            name: ex.name,
            type: 'strength' as const,
            sets: ex.sets,
            reps: ex.reps,
            weight_kg: ex.weight_kg ?? 0,
            muscle_groups: [],
          }
        }

        const { data: historyRows } = await supabase
          .from('workout_exercises')
          .select('weight_kg, reps, sort_order')
          .eq('exercise_name', ex.name)
          .order('created_at', { ascending: false })
          .limit(6)

        const history = (historyRows ?? []).map((r: { weight_kg: number | null; reps: number | null }) => ({
          weight_kg: r.weight_kg,
          reps: r.reps,
          date: today,
        }))

        const overload = calculateProgressiveOverload({
          exerciseName: ex.name,
          targetSets: ex.sets,
          targetReps: ex.reps,
          history,
          prescribedWeight: ex.weight_kg,
        })

        return {
          name: ex.name,
          type: 'strength' as const,
          sets: ex.sets,
          reps: ex.reps,
          weight_kg: overload.recommended_weight_kg,
          muscle_groups: [],
          notes: overload.basis,
        }
      })
    )

    const suggestedWorkout: SuggestedWorkout = {
      title: `${focus.charAt(0).toUpperCase() + focus.slice(1)} Day — Week ${weekNum}`,
      estimated_minutes: resolvedExercises.length * 8 + 10,
      muscle_groups: [],
      exercises: resolvedExercises,
    }

    await supabase.from('ai_suggestions').upsert({
      user_id: user.id,
      date: today,
      suggested_workout: suggestedWorkout,
      model_used: 'program',
    }, { onConflict: 'user_id,date' })

    return NextResponse.json({ suggestion: suggestedWorkout, isProgramBased: true })
  }

  // Fallback: existing LLM-based ad-hoc path (no active program)
  const model = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'

  const fourteenDaysAgo = format(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  const { data: recentWorkouts } = await supabase
    .from('workouts')
    .select('*, workout_exercises(*)')
    .eq('user_id', user.id)
    .gte('date', fourteenDaysAgo)
    .order('date', { ascending: false })

  const workoutsWithExercises = (recentWorkouts ?? []).map(w => ({
    ...w,
    exercises: (w.workout_exercises ?? []) as WorkoutExercise[],
  })) as Array<Workout & { exercises: WorkoutExercise[] }>

  let weeklyPlan: WeeklyPlan | null = null
  const { data: existingPlan } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .single()

  if (existingPlan) {
    weeklyPlan = existingPlan as WeeklyPlan
  } else {
    const planPrompt = buildWeeklyPlanPrompt(profile, equipment ?? [], workoutsWithExercises, weekStart)
    let planJson: { split_type: WeeklyPlan['split_type']; day_slots: WeeklyPlan['day_slots'] }
    try {
      const raw = await callOpenRouter([{ role: 'user', content: planPrompt }], model)
      const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      planJson = JSON.parse(clean)
    } catch {
      planJson = {
        split_type: profile.preferred_split === 'auto' ? 'full_body' : profile.preferred_split,
        day_slots: { mon: 'full_body', tue: 'rest', wed: 'full_body', thu: 'rest', fri: 'full_body', sat: 'rest', sun: 'rest' },
      }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('weekly_plans')
      .upsert({ user_id: user.id, week_start: weekStart, split_type: planJson.split_type, day_slots: planJson.day_slots, model_used: model }, { onConflict: 'user_id,week_start', ignoreDuplicates: true })
      .select()
      .single()

    if (insertErr || !inserted) {
      const { data: reFetched } = await supabase.from('weekly_plans').select('*').eq('user_id', user.id).eq('week_start', weekStart).single()
      weeklyPlan = (reFetched as WeeklyPlan) ?? null
    } else {
      weeklyPlan = inserted as WeeklyPlan
    }
  }

  const focus: DayFocus = weeklyPlan?.day_slots[dayKeyFor(now)] ?? 'rest'
  if (focus === 'rest') return NextResponse.json({ rest: true, weeklyPlan, focus })

  const { data: cached } = await supabase.from('ai_suggestions').select('*').eq('user_id', user.id).eq('date', today).single()
  if (cached) return NextResponse.json({ suggestion: cached.suggested_workout, weeklyPlan, focus })

  const prompt = buildWorkoutPrompt(profile, equipment ?? [], workoutsWithExercises, dayOfWeek, focus)
  let suggestedWorkout: SuggestedWorkout
  try {
    const raw = await callOpenRouter([{ role: 'user', content: prompt }], model)
    const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    suggestedWorkout = JSON.parse(clean)
  } catch {
    suggestedWorkout = {
      title: 'General Fitness', estimated_minutes: 45, muscle_groups: ['full body'],
      exercises: [
        { name: 'Bodyweight Squat', type: 'strength', sets: 3, reps: 12, weight_kg: 0, muscle_groups: ['legs'] },
        { name: 'Push-up', type: 'strength', sets: 3, reps: 10, weight_kg: 0, muscle_groups: ['chest', 'shoulders'] },
        { name: 'Walking', type: 'cardio', duration_minutes: 20, muscle_groups: ['cardio'] },
      ],
    }
  }

  await supabase.from('ai_suggestions').upsert({ user_id: user.id, date: today, suggested_workout: suggestedWorkout, model_used: model })
  return NextResponse.json({ suggestion: suggestedWorkout, weeklyPlan, focus })
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep "suggest-workout" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/suggest-workout/route.ts
git commit -m "feat: update suggest-workout to read from training_programs with progressive overload"
```

---

### Task 11: Fix Start Workout bug + add visibilitychange listener

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Fix the Start Workout button**

In `src/app/dashboard/page.tsx`, replace the `onClick` handler of the "START WORKOUT" button (around line 319–338). The existing code passes stale `suggestion` state as `suggestion_snapshot`. Replace with a fresh fetch:

```tsx
onClick={async () => {
  const supabaseClient = createClient()
  const { data: { user } } = await supabaseClient.auth.getUser()
  if (!user) return

  // Fetch the freshest session server-side (cache hit is fast)
  const res = await fetch('/api/suggest-workout', { method: 'POST' })
  if (!res.ok) return
  const body = await res.json() as { suggestion?: SuggestedWorkout; rest?: boolean }
  if (body.rest || !body.suggestion) return

  const todayDate = format(new Date(), 'yyyy-MM-dd')
  const { data } = await supabaseClient.from('workouts').insert({
    user_id: user.id,
    date: todayDate,
    status: 'in_progress',
    suggestion_snapshot: body.suggestion,
  }).select().single()

  if (data) {
    setTodayWorkoutId(data.id)
    router.push(`/workout/${data.id}`)
  }
}}
```

- [ ] **Step 2: Add visibilitychange listener**

In the `useEffect` for the main `load()` call (around line 83), add a `visibilitychange` listener after the closing of the `load()` function:

```ts
const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    loadSuggestion()
  }
}

document.addEventListener('visibilitychange', handleVisibilityChange)
return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
```

The `useEffect` cleanup already has `// eslint-disable-next-line` comment. Replace the bare `load()` call with:

```ts
load()
document.addEventListener('visibilitychange', handleVisibilityChange)
return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
```

And define `handleVisibilityChange` before the `load()` call inside the `useEffect`.

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "fix: fetch fresh session on Start Workout; add visibilitychange refresh"
```

---

### Task 12: Show prescribed targets in workout session UI

**Files:**
- Modify: `src/app/workout/[id]/page.tsx`
- Modify: `src/components/WorkoutCard.tsx`

- [ ] **Step 1: Add prescribed target row in `src/app/workout/[id]/page.tsx`**

In the exercise card loop (around line 231–240 where exercise name and muscle groups are shown), add a prescribed target line below the muscle groups row. Find the `<div className="min-w-0">` block and add after the muscle groups `<p>`:

```tsx
{ex.type === 'strength' && ex.sets && ex.weight_kg != null && ex.weight_kg > 0 && (
  <p className="font-label-caps text-[9px] text-primary-container/60 tracking-widest mt-[2px]">
    TARGET: {ex.weight_kg}KG · {ex.sets}×{ex.reps ?? '?'}
  </p>
)}
```

- [ ] **Step 2: Pre-fill weight in ExerciseLogger**

Read `src/components/ExerciseLogger.tsx` to understand its props. If it already accepts a `defaultWeight` prop, pass `ex.weight_kg`. If not, add support:

In `ExerciseLogger.tsx`, add `defaultWeight?: number` to the props interface, and use it as the initial value for the weight field in the first set:

```tsx
// In ExerciseLogger props interface
defaultWeight?: number

// In the initial set state (useState for sets)
// Change from: { set_number: 1, weight_kg: null, reps: null, perceived_effort: null }
// To:
{ set_number: 1, weight_kg: props.defaultWeight ?? null, reps: null, perceived_effort: null }
```

Then in `src/app/workout/[id]/page.tsx`, pass `defaultWeight` to `ExerciseLogger`:

```tsx
<ExerciseLogger
  key={`logger-${i}`}
  exercise={ex}
  onComplete={entry => handleComplete(entry, i)}
  sortOrder={i}
  defaultWeight={ex.weight_kg ?? undefined}
/>
```

- [ ] **Step 3: Update "SUGGESTED" → "PRESCRIBED" badge in WorkoutCard**

In `src/components/WorkoutCard.tsx`, the component currently receives `workout: SuggestedWorkout | null`. Add a `isPrescribed` prop:

```tsx
interface Props {
  workout: SuggestedWorkout | null
  loading: boolean
  isPrescribed?: boolean
}

export function WorkoutCard({ workout, loading, isPrescribed }: Props) {
```

Then change the badge text (around line 43–47):

```tsx
<div className="px-3 py-1 bg-primary-container text-on-primary-container font-label-caps text-label-caps rounded flex items-center gap-1 shadow-[0_0_15px_rgba(195,244,0,0.3)]">
  <span className="material-symbols-outlined text-[14px]">{isPrescribed ? 'verified' : 'bolt'}</span>
  {isPrescribed ? 'PRESCRIBED' : 'SUGGESTED'}
</div>
```

In `src/app/dashboard/page.tsx`, update `WorkoutCard` usage to pass `isPrescribed`:

In the `loadSuggestion` function, after setting `setSuggestion`, also track whether it came from a program. Add state: `const [isPrescribed, setIsPrescribed] = useState(false)`. In `loadSuggestion`: `setIsPrescribed(body.isProgramBased ?? false)`. Pass `isPrescribed={isPrescribed}` to `<WorkoutCard>`.

- [ ] **Step 4: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/workout/[id]/page.tsx src/components/ExerciseLogger.tsx src/components/WorkoutCard.tsx src/app/dashboard/page.tsx
git commit -m "feat: show prescribed targets in session UI; pre-fill weight; update badge"
```

---

## Milestone 3: Trainer Chat

### Task 13: Implement trainer chat streaming route

**Files:**
- Create: `src/app/api/trainer/chat/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/trainer/chat/route.ts`:

```ts
import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'

const SYSTEM_PROMPT = `You are an expert personal trainer and coach. You have access to the user's training program, workout history, and exercise performance data.

Always start by calling get_trainer_history({ limit: 20 }) to restore conversation context, then answer the user's question using whatever tools are helpful.

If the user requests a change to their program (e.g. swap an exercise, adjust load, change a day), call adjust_program_week with detailed reasoning.

Always end by calling add_trainer_message with your complete response text so it is saved to the conversation history.

Keep replies concise and practical. Use data from the tools. Be direct like a coach, not a chatbot.`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await request.json() as { message: string }
  const userMessage = body.message?.trim()
  if (!userMessage) return new Response('Bad Request', { status: 400 })

  // Persist user message
  await supabase.from('trainer_messages').insert({
    user_id: user.id,
    role: 'user',
    content: userMessage,
    message_type: 'chat',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const result = streamText({
      model: agentModel,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      tools: createAgentTools(supabase, user.id),
      maxSteps: 6,
      abortSignal: controller.signal,
      onFinish: () => clearTimeout(timeout),
    })

    return result.toDataStreamResponse()
  } catch {
    clearTimeout(timeout)
    return new Response(
      JSON.stringify({ error: 'Something went wrong, try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep "trainer/chat" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/trainer/chat/route.ts
git commit -m "feat: add trainer chat streaming route"
```

---

### Task 14: Build TrainerChatThread component

**Files:**
- Create: `src/components/TrainerChatThread.tsx`

- [ ] **Step 1: Create `src/components/TrainerChatThread.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import type { TrainerMessage } from '@/lib/types'

interface DisplayMessage {
  id: string
  role: 'trainer' | 'user'
  content: string
  message_type: TrainerMessage['message_type']
  created_at?: string
}

interface Props {
  history: TrainerMessage[]
  isStreaming: boolean
  streamContent: string
}

function MessageBubble({ msg }: { msg: DisplayMessage }) {
  const isTrainer = msg.role === 'trainer'

  if (isTrainer && (msg.message_type === 'weekly_review' || msg.message_type === 'check_in')) {
    return (
      <div className="flex gap-sm items-start">
        <div className="w-8 h-8 rounded-full bg-primary-container/20 border border-primary-container/30 flex items-center justify-center flex-shrink-0 mt-1">
          <span className="material-symbols-outlined text-[16px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
        </div>
        <div className="flex-1 bg-surface-container border border-primary-container/20 rounded-2xl rounded-tl-sm p-sm">
          <p className="font-label-caps text-[9px] text-primary-container/60 tracking-widest uppercase mb-xs">
            {msg.message_type === 'weekly_review' ? 'Weekly Review' : 'Coach Check-in'}
          </p>
          <p className="font-body-md text-[14px] text-on-surface whitespace-pre-wrap">{msg.content}</p>
          {msg.created_at && (
            <p className="font-mono text-[9px] text-on-surface-variant/30 mt-xs">
              {format(new Date(msg.created_at), 'MMM d, h:mm a')}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (isTrainer) {
    return (
      <div className="flex gap-sm items-start">
        <div className="w-8 h-8 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center flex-shrink-0 mt-1">
          <span className="material-symbols-outlined text-[16px] text-on-surface-variant/60" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
        </div>
        <div className="flex-1 bg-surface-container border border-white/[0.06] rounded-2xl rounded-tl-sm p-sm max-w-[85%]">
          <p className="font-body-md text-[14px] text-on-surface whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end">
      <div className="bg-primary-container/15 border border-primary-container/20 rounded-2xl rounded-tr-sm p-sm max-w-[85%]">
        <p className="font-body-md text-[14px] text-on-surface whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  )
}

export function TrainerChatThread({ history, isStreaming, streamContent }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, streamContent])

  return (
    <div className="flex flex-col gap-md">
      {history.map(msg => (
        <MessageBubble
          key={msg.id}
          msg={{ id: msg.id, role: msg.role, content: msg.content, message_type: msg.message_type, created_at: msg.created_at }}
        />
      ))}

      {isStreaming && (
        <div className="flex gap-sm items-start">
          <div className="w-8 h-8 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center flex-shrink-0 mt-1">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant/60 animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
          </div>
          <div className="flex-1 bg-surface-container border border-white/[0.06] rounded-2xl rounded-tl-sm p-sm max-w-[85%]">
            {streamContent ? (
              <p className="font-body-md text-[14px] text-on-surface whitespace-pre-wrap">{streamContent}</p>
            ) : (
              <div className="flex gap-[4px] items-center py-[2px]">
                <div className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/40 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep "TrainerChatThread" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/TrainerChatThread.tsx
git commit -m "feat: add TrainerChatThread component with streaming + message type rendering"
```

---

### Task 15: Build /trainer page

**Files:**
- Create: `src/app/trainer/page.tsx`

- [ ] **Step 1: Create `src/app/trainer/page.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BottomNav } from '@/components/BottomNav'
import { TrainerChatThread } from '@/components/TrainerChatThread'
import type { TrainerMessage, TrainingProgram } from '@/lib/types'

export default function TrainerPage() {
  const [history, setHistory] = useState<TrainerMessage[]>([])
  const [program, setProgram] = useState<TrainingProgram | null>(null)
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Mark unread messages as read
      await supabase
        .from('trainer_messages')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .is('read_at', null)

      const [{ data: msgs }, { data: prog }] = await Promise.all([
        supabase
          .from('trainer_messages')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(50),
        supabase
          .from('training_programs')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single(),
      ])

      setHistory(msgs ?? [])
      setProgram(prog ?? null)
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function sendMessage() {
    const msg = input.trim()
    if (!msg || isStreaming) return
    setInput('')
    setIsStreaming(true)
    setStreamContent('')

    // Optimistically add user message to display
    const tempUserId = `temp-${Date.now()}`
    setHistory(prev => [...prev, {
      id: tempUserId,
      user_id: '',
      role: 'user',
      content: msg,
      message_type: 'chat',
      metadata: null,
      read_at: null,
      created_at: new Date().toISOString(),
    }])

    try {
      const response = await fetch('/api/trainer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      })

      if (!response.ok || !response.body) {
        setIsStreaming(false)
        setHistory(prev => [...prev, {
          id: `err-${Date.now()}`, user_id: '', role: 'trainer',
          content: 'Something went wrong, try again.', message_type: 'chat',
          metadata: null, read_at: null, created_at: new Date().toISOString(),
        }])
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value, { stream: true })
        for (const line of text.split('\n')) {
          if (line.startsWith('0:')) {
            try {
              const chunk = JSON.parse(line.slice(2)) as string
              accumulated += chunk
              setStreamContent(accumulated)
            } catch { /* skip malformed chunk */ }
          }
        }
      }

      // Stream complete — reload history from DB to get persisted messages
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: msgs } = await supabase
          .from('trainer_messages')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(50)
        setHistory(msgs ?? [])
      }
    } finally {
      setIsStreaming(false)
      setStreamContent('')
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const activePhase = program
    ? program.phases.find(p => {
        const [, max] = p.week_range
        return max <= program.duration_weeks
      }) ?? program.phases[0]
    : null

  return (
    <div className="flex flex-col min-h-screen">
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex justify-between items-center px-margin h-14">
          <h1 className="font-headline-lg text-[20px] text-primary-container uppercase tracking-wider font-bold">Trainer</h1>
          <div className="flex items-center gap-xs">
            <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
            <span className="font-mono text-[10px] text-on-surface-variant/60 uppercase tracking-widest">AI Coach</span>
          </div>
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[160px] px-margin flex flex-col gap-md">
        {/* Program summary card */}
        {program && activePhase && (
          <section className="bg-surface-container border border-white/[0.06] rounded-2xl p-md mt-sm">
            <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest uppercase mb-xs">Active Program</p>
            <p className="font-headline-md text-[16px] text-on-surface uppercase">
              {program.goal.replace(/_/g, ' ')} · {program.duration_weeks}wk
            </p>
            <p className="font-body-md text-[13px] text-on-surface-variant mt-[2px]">
              {activePhase.name} · {activePhase.focus}
            </p>
          </section>
        )}

        {!program && !loading && (
          <section className="bg-surface-container border border-white/[0.06] rounded-2xl p-md mt-sm">
            <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest uppercase mb-xs">No Program</p>
            <p className="font-body-md text-[13px] text-on-surface-variant">
              Go to Profile → Change Program to generate your first training block.
            </p>
          </section>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-lg">
            <span className="material-symbols-outlined text-[32px] text-primary-container animate-pulse">psychology</span>
          </div>
        ) : (
          <TrainerChatThread
            history={history}
            isStreaming={isStreaming}
            streamContent={streamContent}
          />
        )}
      </main>

      {/* Pinned input bar */}
      <div className="fixed bottom-[64px] left-1/2 -translate-x-1/2 w-full max-w-md bg-surface/95 backdrop-blur-xl border-t border-white/[0.06] px-margin py-sm z-40">
        <div className="flex items-end gap-sm">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask your trainer anything…"
            rows={1}
            disabled={isStreaming}
            className="flex-1 bg-surface-container-high border border-white/[0.08] rounded-xl px-sm py-xs font-body-md text-[14px] text-on-surface placeholder:text-on-surface-variant/40 resize-none outline-none focus:border-primary-container/40 transition-colors disabled:opacity-50 min-h-[40px] max-h-[120px]"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="w-10 h-10 rounded-xl bg-primary-container text-on-primary-container flex items-center justify-center flex-shrink-0 hover:brightness-110 disabled:opacity-40 transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep "trainer/page" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/trainer/page.tsx
git commit -m "feat: add /trainer page with program summary and streaming chat"
```

---

### Task 16: Add Trainer tab to BottomNav with unread badge

**Files:**
- Modify: `src/components/BottomNav.tsx`

- [ ] **Step 1: Update `src/components/BottomNav.tsx`**

Replace the entire file content:

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const NAV_ITEMS = [
  { href: '/dashboard', icon: 'dashboard', label: 'Home' },
  { href: '/trainer', icon: 'psychology', label: 'Trainer' },
  { href: '/history', icon: 'monitoring', label: 'History' },
  { href: '/profile', icon: 'person', label: 'Profile' },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const [unreadCount, setUnreadCount] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    async function fetchUnread() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase
        .from('trainer_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('role', 'trainer')
        .is('read_at', null)
      setUnreadCount(count ?? 0)
    }
    fetchUnread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/90 backdrop-blur-xl border-t border-white/[0.06]">
      <div className="flex justify-around items-center h-16 px-xs">
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          const showBadge = item.href === '/trainer' && unreadCount > 0 && !isActive
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center gap-[2px] w-16 py-xs rounded-xl transition-all duration-200 ${
                isActive
                  ? 'text-primary-container'
                  : 'text-on-surface-variant/50 hover:text-on-surface-variant'
              }`}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'text-primary-container' : ''}`}>
                {item.label}
              </span>
              {showBadge && (
                <span className="absolute top-1 right-2 min-w-[16px] h-4 px-[3px] rounded-full bg-primary-container text-on-primary-container text-[9px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
              {isActive && (
                <div className="absolute bottom-1 w-5 h-[3px] rounded-full bg-primary-container" />
              )}
            </Link>
          )
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep "BottomNav" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BottomNav.tsx
git commit -m "feat: add Trainer tab to BottomNav with unread badge count"
```

---

### Task 17: Build CoachingCard + wire to dashboard

**Files:**
- Create: `src/components/CoachingCard.tsx`
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Create `src/components/CoachingCard.tsx`**

```tsx
'use client'

import type { TrainerMessage } from '@/lib/types'
import { format } from 'date-fns'

interface Props {
  message: TrainerMessage
  onDismiss: (id: string) => void
}

export function CoachingCard({ message, onDismiss }: Props) {
  const typeLabel: Record<TrainerMessage['message_type'], string> = {
    check_in: 'Coach Check-in',
    weekly_review: 'Weekly Review',
    program_adjustment: 'Program Update',
    chat: 'Message',
    session_feedback: 'Session Feedback',
  }

  return (
    <div className="relative bg-surface-container border border-primary-container/20 rounded-2xl p-md overflow-hidden">
      {/* Glow line */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-container/50 to-transparent" />

      <div className="flex items-start gap-sm">
        <div className="w-9 h-9 rounded-xl bg-primary-container/10 border border-primary-container/20 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-[18px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>psychology</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-[4px]">
            <p className="font-label-caps text-[9px] text-primary-container/70 tracking-widest uppercase">
              {typeLabel[message.message_type]}
            </p>
            <p className="font-mono text-[9px] text-on-surface-variant/30">
              {format(new Date(message.created_at), 'MMM d')}
            </p>
          </div>
          <p className="font-body-md text-[14px] text-on-surface line-clamp-3">{message.content}</p>
        </div>
        <button
          onClick={() => onDismiss(message.id)}
          className="flex-shrink-0 text-on-surface-variant/30 hover:text-on-surface-variant transition-colors -mt-[2px] -mr-[4px] p-[4px]"
          aria-label="Dismiss"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add CoachingCards to dashboard**

In `src/app/dashboard/page.tsx`, add the following:

**Imports** (add at top):
```ts
import { CoachingCard } from '@/components/CoachingCard'
import type { TrainerMessage } from '@/lib/types'
```

**State** (add with other `useState` calls):
```ts
const [coachingCards, setCoachingCards] = useState<TrainerMessage[]>([])
```

**Load coaching cards** (inside the main `load()` function, after `setLoading(false)` or after loading workouts):
```ts
const { data: cards } = await supabase
  .from('trainer_messages')
  .select('*')
  .eq('user_id', user.id)
  .in('message_type', ['check_in', 'weekly_review', 'program_adjustment'])
  .is('read_at', null)
  .order('created_at', { ascending: false })
  .limit(3)
setCoachingCards(cards ?? [])
```

**Dismiss handler** (add as a component function):
```ts
async function dismissCard(id: string) {
  setCoachingCards(prev => prev.filter(c => c.id !== id))
  await supabase
    .from('trainer_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
}
```

**Render** (add in the JSX, above the "Today's Workout" card, i.e. before the `{isRestDay ? ...` block):
```tsx
{coachingCards.length > 0 && (
  <section aria-label="Coaching Messages" className="flex flex-col gap-xs">
    {coachingCards.map(card => (
      <CoachingCard key={card.id} message={card} onDismiss={dismissCard} />
    ))}
  </section>
)}
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/CoachingCard.tsx src/app/dashboard/page.tsx
git commit -m "feat: add CoachingCard component and wire coaching cards to dashboard"
```

---

### Task 18: Upgrade session-chat to multi-turn streaming

**Files:**
- Modify: `src/app/api/session-chat/route.ts`

- [ ] **Step 1: Replace `src/app/api/session-chat/route.ts`**

```ts
import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'
import type { SuggestedWorkout } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const body = await request.json() as {
    todayWorkout: SuggestedWorkout
    exerciseName: string
    userMessage: string
  }

  const { data: equipment } = await supabase
    .from('user_equipment')
    .select('equipment_name')
    .eq('user_id', user.id)

  const equipmentList = (equipment ?? []).map((e: { equipment_name: string }) => e.equipment_name).join(', ')

  // Persist user message
  await supabase.from('trainer_messages').insert({
    user_id: user.id,
    role: 'user',
    content: body.userMessage,
    message_type: 'session_feedback',
    metadata: { exerciseName: body.exerciseName },
  })

  const result = streamText({
    model: agentModel,
    system: `You are a personal trainer coaching during an active workout session. The user is currently doing: ${body.exerciseName}. Today's workout: ${JSON.stringify(body.todayWorkout)}. Available equipment: ${equipmentList || 'bodyweight only'}. Give a 2-3 sentence practical response. If suggesting a substitute, name it specifically. Call add_trainer_message to save your reply.`,
    messages: [{ role: 'user', content: body.userMessage }],
    tools: createAgentTools(supabase, user.id),
    maxSteps: 3,
  })

  return result.toDataStreamResponse()
}
```

Note: Also update `SessionChat` component to consume the streamed response. Read `src/components/SessionChat.tsx` first to see the current implementation, then update the `fetch` call to handle a streaming response instead of `{ reply: string }`.

In `SessionChat.tsx`, the message fetch currently expects `{ reply: string }`. Update to read the stream using the same pattern as the trainer page:

```ts
const response = await fetch('/api/session-chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ todayWorkout: workout, exerciseName: currentExercise, userMessage }),
})

const reader = response.body!.getReader()
const decoder = new TextDecoder()
let reply = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  const text = decoder.decode(value, { stream: true })
  for (const line of text.split('\n')) {
    if (line.startsWith('0:')) {
      try { reply += JSON.parse(line.slice(2)) as string } catch { /* skip */ }
    }
  }
}
// Use reply as the assistant response
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/session-chat/route.ts src/components/SessionChat.tsx
git commit -m "feat: upgrade session-chat to multi-turn streaming with trainer_messages persistence"
```

---

## Milestone 4: Weekly Review

### Task 19: Implement review-week route

**Files:**
- Create: `src/app/api/trainer/review-week/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/trainer/review-week/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { generateText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'

const SYSTEM_PROMPT = `You are a strength coach performing a weekly training review.

Steps:
1. Call get_current_program to get the current program and this week's data
2. Call get_workout_history({ days: 7 }) to get actual performance data
3. Compare prescribed vs actual: look at volume (sets × reps), adherence (sessions completed vs planned), and weight progression
4. Decide on adjustments for next week: increase load if on track, reduce volume if overreaching, substitute if equipment issue
5. Call adjust_program_week for the NEXT week number with your adjustments and detailed reasoning
6. Call add_trainer_message with type "weekly_review" and a summary including: adherence %, key lifts progress, what's changing next week and why

Be analytical and specific. Reference actual numbers. Keep the message under 200 words.`

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Set reviewed_at immediately to prevent double-trigger from concurrent loads
  const { data: activeWeek } = await supabase
    .from('program_weeks')
    .select('id, program_id, week_number, reviewed_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .is('reviewed_at', null)
    .single()

  if (!activeWeek) {
    return NextResponse.json({ skipped: true, reason: 'no unreviewed active week' })
  }

  // Claim the review slot — set reviewed_at now so concurrent requests skip
  await supabase
    .from('program_weeks')
    .update({ reviewed_at: new Date().toISOString() })
    .eq('id', activeWeek.id)
    .is('reviewed_at', null) // double-check still null (optimistic lock)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  try {
    await generateText({
      model: agentModel,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Perform the weekly review now.' }],
      tools: createAgentTools(supabase, user.id),
      maxSteps: 4,
      abortSignal: controller.signal,
    })

    clearTimeout(timeout)

    // Mark the reviewed week as completed; mark next week as active
    await supabase
      .from('program_weeks')
      .update({ status: 'completed' })
      .eq('id', activeWeek.id)

    await supabase
      .from('program_weeks')
      .update({ status: 'active' })
      .eq('program_id', activeWeek.program_id)
      .eq('week_number', activeWeek.week_number + 1)

    return NextResponse.json({ success: true })
  } catch (error) {
    clearTimeout(timeout)
    // Review failure is silent — dashboard loads normally, retried on next load
    // Reset reviewed_at so it can be retried
    await supabase
      .from('program_weeks')
      .update({ reviewed_at: null })
      .eq('id', activeWeek.id)

    const isTimeout = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json({ error: isTimeout ? 'timeout' : 'failed' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep "review-week" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/trainer/review-week/route.ts
git commit -m "feat: add review-week agent route with optimistic lock"
```

---

### Task 20: Build ProgramCard component

**Files:**
- Create: `src/components/ProgramCard.tsx`

- [ ] **Step 1: Create `src/components/ProgramCard.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { TrainingProgram } from '@/lib/types'
import { differenceInDays, parseISO } from 'date-fns'

interface Props {
  program: TrainingProgram
}

const STATUS_COLOR = {
  completed: 'text-primary-container',
  active: 'text-cyan-400',
  upcoming: 'text-on-surface-variant/40',
}

export function ProgramCard({ program }: Props) {
  const [expanded, setExpanded] = useState(false)

  const today = new Date()
  const start = parseISO(program.start_date)
  const daysSinceStart = differenceInDays(today, start)
  const currentWeek = Math.min(Math.ceil((daysSinceStart + 1) / 7), program.duration_weeks)
  const progressPct = Math.round((currentWeek / program.duration_weeks) * 100)

  const activePhase = program.phases.find(
    p => currentWeek >= p.week_range[0] && currentWeek <= p.week_range[1]
  ) ?? program.phases[0]

  const goalLabel = program.goal.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  return (
    <section aria-label="Program Progress" className="bg-surface-container border border-white/[0.06] rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="w-full flex flex-col px-md py-sm hover:bg-white/[0.02] transition-colors gap-xs"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-xs">
            <span className="material-symbols-outlined text-[16px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>layers</span>
            <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest uppercase">
              Week {currentWeek} of {program.duration_weeks} · {goalLabel}
            </p>
          </div>
          <span
            className="material-symbols-outlined text-[16px] text-on-surface-variant/40 transition-transform duration-200"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            expand_more
          </span>
        </div>
        <p className="text-left font-headline-md text-[15px] text-on-surface uppercase">
          {activePhase?.name ?? 'Active Block'}
        </p>
        {/* Progress bar */}
        <div className="w-full h-1 bg-surface-container-high rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-container rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-left font-label-caps text-[9px] text-on-surface-variant/40 tracking-widest">
          {progressPct}% COMPLETE
        </p>
      </button>

      {expanded && (
        <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
          {program.phases.map(phase => {
            const isActive = currentWeek >= phase.week_range[0] && currentWeek <= phase.week_range[1]
            const isCompleted = currentWeek > phase.week_range[1]
            const status: 'active' | 'completed' | 'upcoming' = isCompleted ? 'completed' : isActive ? 'active' : 'upcoming'

            return (
              <div key={phase.name} className={`flex items-center justify-between px-md py-sm ${isActive ? 'bg-primary-container/5' : ''}`}>
                <div>
                  <p className={`font-headline-md text-[14px] uppercase ${isActive ? 'text-on-surface' : 'text-on-surface-variant/60'}`}>
                    {phase.name}
                  </p>
                  <p className="font-body-md text-[12px] text-on-surface-variant/50">
                    Weeks {phase.week_range[0]}–{phase.week_range[1]} · {phase.focus}
                  </p>
                </div>
                <div className={`font-label-caps text-[10px] tracking-widest uppercase ${STATUS_COLOR[status]}`}>
                  {isCompleted ? (
                    <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  ) : isActive ? (
                    <span className="inline-flex items-center gap-[4px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      NOW
                    </span>
                  ) : (
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant/20">radio_button_unchecked</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | grep "ProgramCard" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ProgramCard.tsx
git commit -m "feat: add ProgramCard component with expandable phase list"
```

---

### Task 21: Wire ProgramCard + weekly review trigger to dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Add program state and load logic**

In `src/app/dashboard/page.tsx`, add:

**Import** (add at top):
```ts
import { ProgramCard } from '@/components/ProgramCard'
import type { TrainingProgram, ProgramWeek } from '@/lib/types'
```

**State** (add with other `useState`):
```ts
const [program, setProgram] = useState<TrainingProgram | null>(null)
```

**Load program + weekly review check** (inside `load()`, after existing Supabase queries):
```ts
const { data: activeProgram } = await supabase
  .from('training_programs')
  .select('*')
  .eq('user_id', user.id)
  .eq('status', 'active')
  .order('created_at', { ascending: false })
  .limit(1)
  .single()

setProgram(activeProgram ?? null)

// Weekly review trigger: check if active week needs review
if (activeProgram) {
  const { data: activeWeek } = await supabase
    .from('program_weeks')
    .select('id, week_number, reviewed_at, status, week_start')
    .eq('program_id', activeProgram.id)
    .eq('status', 'active')
    .is('reviewed_at', null)
    .single()

  if (activeWeek) {
    const weekStartDate = new Date(activeWeek.week_start + 'T00:00:00')
    // Only fire after the week has fully ended (today >= start of the NEXT week)
    const weekEndDate = new Date(weekStartDate)
    weekEndDate.setDate(weekEndDate.getDate() + 7)
    const todayDate = new Date()
    if (todayDate >= weekEndDate) {
      // Fire and forget — failure is silent, review-week sets reviewed_at to prevent double-fire
      fetch('/api/trainer/review-week', { method: 'POST' }).catch(() => {})
    }
  }
}
```

- [ ] **Step 2: Render ProgramCard in JSX**

In the JSX, add the `ProgramCard` immediately after `<WeeklyStrip>` and before the existing weekly plan section. Then remove the entire `{weeklyPlan && (...)}` expandable plan section (the `<section aria-label="Weekly Plan">` block). Replace it with just:

```tsx
{program && <ProgramCard program={program} />}
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: all existing tests pass.

- [ ] **Step 5: Final build check**

```bash
pnpm build 2>&1 | tail -20
```

Expected: build completes with no errors (warnings about missing env vars are OK).

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat: add ProgramCard to dashboard; wire weekly review trigger; remove legacy plan section"
```

---

## Post-Milestone: Self-Review Checklist

- [ ] Run `pnpm test` — all tests pass
- [ ] Run `pnpm build` — no TypeScript or build errors
- [ ] Verify `ANTHROPIC_API_KEY` is set in `.env.local`
- [ ] Test goal-setting screen end-to-end: onboarding completes → `/onboarding/goals` → generates program → lands on dashboard
- [ ] Verify dashboard shows ProgramCard and no weekly plan section for program users
- [ ] Verify dashboard shows the old weekly plan section for users without a program (LLM fallback)
- [ ] Test Start Workout with a fresh fetch (not stale state)
- [ ] Open `/trainer`, send a message, verify it streams and saves to DB
- [ ] Verify BottomNav shows unread badge after a check-in message
- [ ] Verify workout session shows "TARGET: Xkg · N×N" for program-based exercises
