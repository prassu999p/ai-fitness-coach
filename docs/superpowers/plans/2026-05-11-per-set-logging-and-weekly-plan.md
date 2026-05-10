# Per-Set Logging, Weekly Plan, Splits, and Equipment Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-tuple set logger with per-set actuals, add an AI-generated weekly split template surfaced on the dashboard, let the user choose a preferred split style, and ship a categorized equipment editor with custom items and a discoverable entry point.

**Architecture:** Schema-rich (Approach A). New `workout_sets` table for per-set actuals (separate from `workout_exercises` which holds AI targets). New `weekly_plans` table holds the weekly template (day → focus); the existing `ai_suggestions` cache stays the per-day exercise list, regenerated lazily each morning based on today's slot. `profiles.preferred_split` lets users override the AI's split choice.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + RLS + Auth), TypeScript, Tailwind, Jest + ts-jest + @testing-library/react, OpenRouter for LLM calls.

**Source spec:** `docs/superpowers/specs/2026-05-11-per-set-logging-and-weekly-plan-design.md`

**Branch:** `feat/per-set-logging-and-weekly-plan`

---

## File Structure

**Created files:**
- `supabase/migrations/002_per_set_and_weekly_plan.sql` — DDL for `workout_sets`, `weekly_plans`, `profiles.preferred_split`, plus backfill.
- `src/lib/equipmentCatalog.ts` — shared categorized equipment list (presets) used by onboarding and profile.
- `src/lib/splitOptions.ts` — shared split definitions (id/label/description) used by profile and prompts.
- `src/app/api/regenerate-weekly-plan/route.ts` — POST endpoint that forces regeneration of the current week's plan + today's `ai_suggestions`.

**Modified files:**
- `src/lib/types.ts` — adds `SplitType`, `DayFocus`, `WorkoutSet`, `WeeklyPlan`, extends `Profile`.
- `src/lib/prompts.ts` — new `buildWeeklyPlanPrompt`, updated `buildWorkoutPrompt` with `dailyFocus`.
- `src/lib/__tests__/prompts.test.ts` — added cases for weekly plan and focus-aware daily prompt.
- `src/app/api/suggest-workout/route.ts` — refactored to ensure-weekly-plan-then-day flow.
- `src/components/ExerciseLogger.tsx` — multi-set strength variant.
- `src/components/__tests__/ExerciseLogger.test.tsx` — rewritten for multi-set.
- `src/app/workout/[id]/page.tsx` — handles `{ exercise, sets[] }` payload + two-step insert.
- `src/app/workout/log/page.tsx` — same payload + two-step insert.
- `src/app/profile/page.tsx` — Preferred Split section, categorized equipment, custom input.
- `src/app/onboarding/page.tsx` — categorized equipment (no custom input).
- `src/components/WeeklyStrip.tsx` — day-focus labels under each day.
- `src/app/dashboard/page.tsx` — "This week's plan" panel, "Edit plan" link, equipment chip, rest-day card.

**File responsibilities:**
- Equipment list lives in `equipmentCatalog.ts` so it can't drift between onboarding and profile.
- Split options live in `splitOptions.ts` so the UI labels and the prompt instructions stay aligned.
- `prompts.ts` is the only place strings about workout planning live; `route.ts` files only orchestrate.

---

## Task 1: Migration — add `workout_sets`, `weekly_plans`, `profiles.preferred_split`

**Files:**
- Create: `supabase/migrations/002_per_set_and_weekly_plan.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/002_per_set_and_weekly_plan.sql`:

```sql
-- Per-set actuals (one row per set actually performed)
create table workout_sets (
  id                  uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid references workout_exercises(id) on delete cascade not null,
  set_number          int  not null,
  weight_kg           numeric(6,2),
  reps                int,
  perceived_effort    int check (perceived_effort between 1 and 5),
  created_at          timestamptz default now(),
  unique (workout_exercise_id, set_number)
);

alter table workout_sets enable row level security;

create policy "workout_sets_self" on workout_sets
  for all using (
    exists (
      select 1
      from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = workout_sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  );

-- Weekly split template (day -> focus)
create table weekly_plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references profiles(id) on delete cascade not null,
  week_start   date not null,
  split_type   text not null check (split_type in ('full_body','upper_lower','ppl','body_part','auto')),
  day_slots    jsonb not null,
  model_used   text not null,
  created_at   timestamptz default now(),
  unique (user_id, week_start)
);

alter table weekly_plans enable row level security;
create policy "weekly_plans_self" on weekly_plans
  for all using (auth.uid() = user_id);

-- Preferred split on profiles
alter table profiles
  add column preferred_split text not null default 'auto'
    check (preferred_split in ('auto','full_body','upper_lower','ppl','body_part'));

-- Backfill: replay each existing strength workout_exercise row as a single workout_set row
insert into workout_sets (workout_exercise_id, set_number, weight_kg, reps, perceived_effort)
select we.id, 1, we.weight_kg, we.reps, we.perceived_effort
from workout_exercises we
where we.exercise_type = 'strength'
  and we.weight_kg is not null;
```

- [ ] **Step 2: Apply the migration to the linked Supabase project**

Use the Supabase MCP `apply_migration` tool with name `per_set_and_weekly_plan` and the SQL above. (If the agent has only CLI access, run `supabase db push` from the project root.)

Expected: migration applied without errors.

- [ ] **Step 3: Verify schema**

Run via MCP `list_tables` or psql:

```sql
\d workout_sets
\d weekly_plans
\d profiles
```

Expected: `workout_sets` and `weekly_plans` exist with the columns above; `profiles` shows `preferred_split text not null default 'auto'`.

Also verify the backfill ran:

```sql
select count(*) from workout_sets;
select count(*) from workout_exercises where exercise_type = 'strength' and weight_kg is not null;
```

Expected: both counts are equal.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/002_per_set_and_weekly_plan.sql
git commit -m "feat(db): add workout_sets, weekly_plans, profiles.preferred_split"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Append new types and extend `Profile`**

Edit `src/lib/types.ts` — add the new types at the bottom of the file and extend `Profile`:

```ts
// At the top of the existing file, alongside other exports:
export type SplitType = 'auto' | 'full_body' | 'upper_lower' | 'ppl' | 'body_part'
export type DayKey   = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type DayFocus =
  | 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body'
  | 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'rest'

// Extend the existing Profile interface (add the new field):
export interface Profile {
  id: string
  fitness_level: FitnessLevel
  days_per_week: number
  preferred_split: SplitType
  created_at: string
}

// New interfaces at the bottom:
export interface WorkoutSet {
  id: string
  workout_exercise_id: string
  set_number: number
  weight_kg: number | null
  reps: number | null
  perceived_effort: number | null
}

export interface WorkoutSetInput {
  set_number: number
  weight_kg: number | null
  reps: number | null
  perceived_effort: number | null
}

export interface WeeklyPlan {
  id: string
  user_id: string
  week_start: string
  split_type: SplitType
  day_slots: Record<DayKey, DayFocus>
  model_used: string
}
```

- [ ] **Step 2: Run typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: errors in files that consume `Profile` without `preferred_split` (these will be fixed in later tasks); no errors in `types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add SplitType, DayFocus, WorkoutSet, WeeklyPlan"
```

---

## Task 3: Shared catalogs — equipment and split options

**Files:**
- Create: `src/lib/equipmentCatalog.ts`
- Create: `src/lib/splitOptions.ts`

- [ ] **Step 1: Create the equipment catalog**

Create `src/lib/equipmentCatalog.ts`:

```ts
export type EquipmentCategory = 'free_weights' | 'machines' | 'cardio' | 'accessories'

export interface EquipmentItem {
  name: string
  category: EquipmentCategory
}

export const EQUIPMENT_CATEGORIES: Record<EquipmentCategory, string> = {
  free_weights: 'Free Weights',
  machines: 'Machines',
  cardio: 'Cardio',
  accessories: 'Accessories',
}

export const EQUIPMENT_CATALOG: EquipmentItem[] = [
  { name: 'Barbell', category: 'free_weights' },
  { name: 'Dumbbells', category: 'free_weights' },
  { name: 'EZ-bar', category: 'free_weights' },
  { name: 'Kettlebells', category: 'free_weights' },
  { name: 'Plates', category: 'free_weights' },
  { name: 'Bench', category: 'free_weights' },
  { name: 'Rack', category: 'free_weights' },

  { name: 'Smith Machine', category: 'machines' },
  { name: 'Cables', category: 'machines' },
  { name: 'Lat Pulldown', category: 'machines' },
  { name: 'Leg Press', category: 'machines' },
  { name: 'Leg Curl', category: 'machines' },
  { name: 'Leg Extension', category: 'machines' },
  { name: 'Hack Squat', category: 'machines' },
  { name: 'Pec Deck', category: 'machines' },
  { name: 'Chest Press', category: 'machines' },
  { name: 'Row Machine', category: 'machines' },
  { name: 'Hyperextension', category: 'machines' },

  { name: 'Treadmill', category: 'cardio' },
  { name: 'Stationary Bike', category: 'cardio' },
  { name: 'Rowing Machine', category: 'cardio' },
  { name: 'Stairmaster', category: 'cardio' },
  { name: 'Assault Bike', category: 'cardio' },
  { name: 'Elliptical', category: 'cardio' },

  { name: 'Pull-up Bar', category: 'accessories' },
  { name: 'Dip Bars', category: 'accessories' },
  { name: 'Resistance Bands', category: 'accessories' },
  { name: 'TRX', category: 'accessories' },
  { name: 'Battle Ropes', category: 'accessories' },
  { name: 'Medicine Balls', category: 'accessories' },
  { name: 'Foam Roller', category: 'accessories' },
  { name: 'Box', category: 'accessories' },
]

export function isPreset(name: string): boolean {
  const lower = name.toLowerCase()
  return EQUIPMENT_CATALOG.some(item => item.name.toLowerCase() === lower)
}
```

- [ ] **Step 2: Create the split options catalog**

Create `src/lib/splitOptions.ts`:

```ts
import type { SplitType } from './types'

export interface SplitOption {
  value: SplitType
  label: string
  description: string
}

export const SPLIT_OPTIONS: SplitOption[] = [
  { value: 'auto',         label: 'Auto',          description: 'Let the AI pick the best split for your training frequency.' },
  { value: 'full_body',    label: 'Full Body',     description: 'Every session hits all major muscle groups. Best for 2–3 days/week.' },
  { value: 'upper_lower',  label: 'Upper / Lower', description: 'Alternates upper and lower body. Best for 4 days/week.' },
  { value: 'ppl',          label: 'Push / Pull / Legs', description: 'Push, pull, and leg days in rotation. Best for 3–6 days/week.' },
  { value: 'body_part',    label: 'Body-part Split', description: 'Dedicates a day to each muscle group. Best for 5–6 days/week.' },
]
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no new errors from these files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/equipmentCatalog.ts src/lib/splitOptions.ts
git commit -m "feat(lib): add shared equipment catalog and split options"
```

---

## Task 4: `buildWeeklyPlanPrompt` — write the failing test

**Files:**
- Test: `src/lib/__tests__/prompts.test.ts`

- [ ] **Step 1: Append tests for `buildWeeklyPlanPrompt`**

Edit `src/lib/__tests__/prompts.test.ts`. At the top of the file, change the import line to also import the new function (it doesn't exist yet — this is intentional for TDD):

```ts
import { buildWorkoutPrompt, buildSessionChatPrompt, buildWeeklyPlanPrompt } from '@/lib/prompts'
```

And update the `profile` constant at the top so it includes the new `preferred_split` field:

```ts
const profile: Profile = {
  id: 'user-1',
  fitness_level: 'intermediate',
  days_per_week: 4,
  preferred_split: 'auto',
  created_at: '2026-05-01T00:00:00Z',
}
```

Append this `describe` block at the bottom of the file:

```ts
describe('buildWeeklyPlanPrompt', () => {
  it('includes the preferred split when not auto', () => {
    const fixedProfile = { ...profile, preferred_split: 'ppl' as const }
    const prompt = buildWeeklyPlanPrompt(fixedProfile, equipment, [], '2026-05-11')
    expect(prompt).toContain('ppl')
    expect(prompt).toContain('honor')
  })

  it('asks the AI to choose when preferred split is auto', () => {
    const prompt = buildWeeklyPlanPrompt(profile, equipment, [], '2026-05-11')
    expect(prompt.toLowerCase()).toContain('choose')
  })

  it('includes days_per_week as a hard constraint', () => {
    const prompt = buildWeeklyPlanPrompt(profile, equipment, [], '2026-05-11')
    expect(prompt).toContain('4')
    expect(prompt.toLowerCase()).toMatch(/non-rest|training day/)
  })

  it('asks for JSON with day_slots and split_type', () => {
    const prompt = buildWeeklyPlanPrompt(profile, equipment, [], '2026-05-11')
    expect(prompt).toContain('day_slots')
    expect(prompt).toContain('split_type')
    expect(prompt).toContain('JSON')
  })
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

```bash
pnpm test -- --testPathPattern=prompts
```

Expected: FAIL with `buildWeeklyPlanPrompt is not exported from '@/lib/prompts'` (or equivalent).

- [ ] **Step 3: Commit (red phase)**

```bash
git add src/lib/__tests__/prompts.test.ts
git commit -m "test(prompts): add failing tests for buildWeeklyPlanPrompt"
```

---

## Task 5: `buildWeeklyPlanPrompt` — implementation

**Files:**
- Modify: `src/lib/prompts.ts`

- [ ] **Step 1: Update the import line and add the new function**

Edit `src/lib/prompts.ts`. First, change the existing import line:

```ts
import type { Profile, Equipment, Workout, WorkoutExercise, SuggestedWorkout } from '@/lib/types'
```

to:

```ts
import type { Profile, Equipment, Workout, WorkoutExercise, SuggestedWorkout, SplitType } from '@/lib/types'
```

(`SplitType` is referenced indirectly via `Profile.preferred_split`, but importing it now keeps the imports complete for the subsequent task that adds `DayFocus`.)

Append this function at the bottom of `prompts.ts`:

```ts
export function buildWeeklyPlanPrompt(
  profile: Profile,
  equipment: Equipment[],
  recentWorkouts: Array<Workout & { exercises: WorkoutExercise[] }>,
  weekStartDate: string,
): string {
  const equipmentList = equipment.map(e => e.equipment_name).join(', ') || 'bodyweight only'

  const historySection = recentWorkouts.length === 0
    ? 'No workout history — this is a new user.'
    : recentWorkouts.map(w => {
        const groups = Array.from(new Set(w.exercises.flatMap(e => {
          // Best-effort: pull muscle groups from exercise name + type as a hint.
          return [e.exercise_type]
        })))
        return `${w.date} (${w.status}): ${groups.join(', ')}`
      }).join('\n')

  const splitInstruction = profile.preferred_split === 'auto'
    ? 'Choose the most appropriate split_type for the user based on days_per_week and recent history.'
    : `The user has chosen "${profile.preferred_split}" as their preferred split — you MUST honor that choice and set split_type accordingly.`

  return `You are a personal gym trainer AI. Plan a 7-day training week starting Monday ${weekStartDate}.

USER PROFILE:
- Fitness level: ${profile.fitness_level}
- Training days per week: ${profile.days_per_week}
- Preferred split: ${profile.preferred_split}
- Available equipment: ${equipmentList}

RECENT WORKOUT HISTORY (last 14 days):
${historySection}

INSTRUCTIONS:
- ${splitInstruction}
- Assign a focus to each of the 7 days (mon..sun). Valid focus values: "push", "pull", "legs", "upper", "lower", "full_body", "chest", "back", "shoulders", "arms", "core", "rest".
- Exactly ${profile.days_per_week} of the 7 days must be non-rest training days; the remaining must be "rest".
- Do not repeat the exact same focus on two consecutive non-rest days.
- Vary the pattern from the prior week if recent history is available.
- Return ONLY a valid JSON object matching this schema:

{
  "split_type": "auto" | "full_body" | "upper_lower" | "ppl" | "body_part",
  "rationale": "string (1-2 sentences)",
  "day_slots": {
    "mon": "<focus>",
    "tue": "<focus>",
    "wed": "<focus>",
    "thu": "<focus>",
    "fri": "<focus>",
    "sat": "<focus>",
    "sun": "<focus>"
  }
}`
}
```

(Note: `Profile`, `Equipment`, `Workout`, `WorkoutExercise` are already imported at the top of `prompts.ts`. Don't re-import them.)

- [ ] **Step 2: Run the tests — should now pass**

```bash
pnpm test -- --testPathPattern=prompts
```

Expected: all `buildWeeklyPlanPrompt` cases PASS. Existing `buildWorkoutPrompt` tests still pass (they don't reference `dailyFocus` yet — that comes in Task 6).

- [ ] **Step 3: Commit**

```bash
git add src/lib/prompts.ts
git commit -m "feat(prompts): implement buildWeeklyPlanPrompt"
```

---

## Task 6: Update `buildWorkoutPrompt` to take a `dailyFocus`

**Files:**
- Modify: `src/lib/prompts.ts`
- Modify: `src/lib/__tests__/prompts.test.ts`

- [ ] **Step 1: Add a failing test for the focus-aware behavior**

Append inside the existing `describe('buildWorkoutPrompt', ...)` block in `src/lib/__tests__/prompts.test.ts`:

```ts
  it('mentions push-day muscle groups when focus is push', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday', 'push')
    expect(prompt.toLowerCase()).toContain('chest')
    expect(prompt.toLowerCase()).toContain('triceps')
  })

  it('mentions pull-day muscle groups when focus is pull', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday', 'pull')
    expect(prompt.toLowerCase()).toContain('back')
    expect(prompt.toLowerCase()).toContain('biceps')
  })

  it('includes the focus label verbatim', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday', 'legs')
    expect(prompt).toContain('legs')
  })
```

Also update the three existing `buildWorkoutPrompt` tests in the same file to pass a focus argument (use `'full_body'`):

```ts
  it('includes fitness level in prompt', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday', 'full_body')
    expect(prompt).toContain('intermediate')
  })

  it('includes equipment names in prompt', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday', 'full_body')
    expect(prompt).toContain('barbell')
    expect(prompt).toContain('dumbbells')
  })

  it('requests JSON output', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday', 'full_body')
    expect(prompt).toContain('JSON')
  })
```

- [ ] **Step 2: Run the tests — expect failures**

```bash
pnpm test -- --testPathPattern=prompts
```

Expected: the three new focus-aware tests FAIL (and the existing three may also fail with a TS arity error if `buildWorkoutPrompt` doesn't accept a 5th argument yet — that's fine).

- [ ] **Step 3: Update `buildWorkoutPrompt` signature and body**

Edit `src/lib/prompts.ts`. First, update the import line to add `DayFocus`:

```ts
import type { Profile, Equipment, Workout, WorkoutExercise, SuggestedWorkout, SplitType, DayFocus } from '@/lib/types'
```

Then replace the existing `buildWorkoutPrompt` function with the new version below. Note that `FOCUS_MUSCLE_GUIDANCE` is a new module-level constant that must be added just above `buildWorkoutPrompt`:

```ts

const FOCUS_MUSCLE_GUIDANCE: Record<DayFocus, string> = {
  push:      'chest, shoulders, triceps',
  pull:      'back, biceps, rear delts',
  legs:      'quads, hamstrings, glutes, calves',
  upper:     'chest, back, shoulders, biceps, triceps',
  lower:     'quads, hamstrings, glutes, calves, core',
  full_body: 'a balanced mix of upper and lower body',
  chest:     'chest (with light triceps assistance only)',
  back:      'back (with light biceps assistance only)',
  shoulders: 'shoulders (front, side, rear delts)',
  arms:      'biceps and triceps',
  core:      'abs, obliques, lower back',
  rest:      'recovery only — bodyweight mobility and light cardio',
}

export function buildWorkoutPrompt(
  profile: Profile,
  equipment: Equipment[],
  recentWorkouts: Array<Workout & { exercises: WorkoutExercise[] }>,
  dayOfWeek: string,
  dailyFocus: DayFocus,
): string {
  const equipmentList = equipment.map(e => e.equipment_name).join(', ') || 'bodyweight only'

  const historySection = recentWorkouts.length === 0
    ? 'No workout history — this is a new user. Start conservatively.'
    : recentWorkouts.map(w => {
        const exList = w.exercises.map(e =>
          e.exercise_type === 'strength'
            ? `${e.exercise_name}: ${e.sets}x${e.reps} @ ${e.weight_kg}kg (effort ${e.perceived_effort}/5)`
            : `${e.exercise_name}: ${e.duration_minutes}min (effort ${e.perceived_effort}/5)`
        ).join('\n  ')
        return `${w.date} (${w.status}):\n  ${exList}`
      }).join('\n\n')

  const focusGuidance = FOCUS_MUSCLE_GUIDANCE[dailyFocus]

  return `You are a personal gym trainer AI. Generate a workout for today (${dayOfWeek}).

TODAY'S TRAINING FOCUS: ${dailyFocus}
TARGET MUSCLE GROUPS for ${dailyFocus}: ${focusGuidance}

USER PROFILE:
- Fitness level: ${profile.fitness_level}
- Training days per week: ${profile.days_per_week}
- Available equipment: ${equipmentList}

RECENT WORKOUT HISTORY (last 7 days):
${historySection}

INSTRUCTIONS:
- Pick exercises whose primary muscle groups STRICTLY match the focus "${dailyFocus}".
- Only suggest exercises using the available equipment listed above.
- Apply progressive overload based on history (slightly more weight/reps than previous sessions of the same exercise).
- For "rest" focus, return at most 2 short mobility or light-cardio entries totalling ≤ 20 minutes.
- Return ONLY a valid JSON object matching this exact schema:

{
  "title": "string",
  "estimated_minutes": number,
  "muscle_groups": ["string"],
  "exercises": [
    {
      "name": "string",
      "type": "strength" | "cardio",
      "sets": number,
      "reps": number,
      "weight_kg": number,
      "duration_minutes": number,
      "muscle_groups": ["string"],
      "notes": "string"
    }
  ]
}

For strength exercises omit duration_minutes. For cardio exercises omit sets, reps, weight_kg.`
}
```

Also remove the duplicated `import type { Profile, Equipment, Workout, WorkoutExercise, SuggestedWorkout } from '@/lib/types'` line if it's still present at the top (you replaced the import line in the step above, so it should already be a single line).

- [ ] **Step 4: Run the tests — expect pass**

```bash
pnpm test -- --testPathPattern=prompts
```

Expected: all prompt tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/prompts.ts src/lib/__tests__/prompts.test.ts
git commit -m "feat(prompts): make buildWorkoutPrompt focus-aware"
```

---

## Task 7: Refactor `/api/suggest-workout` to ensure weekly plan, then resolve today's slot

**Files:**
- Modify: `src/app/api/suggest-workout/route.ts`

- [ ] **Step 1: Replace the route handler**

Overwrite `src/app/api/suggest-workout/route.ts` with:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callOpenRouter } from '@/lib/openrouter'
import { buildWorkoutPrompt, buildWeeklyPlanPrompt } from '@/lib/prompts'
import { format, startOfWeek } from 'date-fns'
import type {
  SuggestedWorkout,
  WorkoutExercise,
  Workout,
  WeeklyPlan,
  DayFocus,
  DayKey,
} from '@/lib/types'

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function dayKeyFor(date: Date): DayKey {
  return DAY_KEYS[date.getDay()]
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const dayOfWeek = format(now, 'EEEE')
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const [{ data: profile }, { data: equipment }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('user_equipment').select('*').eq('user_id', user.id),
  ])

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

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

  const model = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'

  // 1. Ensure a weekly plan exists for this week.
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
        day_slots: {
          mon: 'full_body', tue: 'rest', wed: 'full_body',
          thu: 'rest', fri: 'full_body', sat: 'rest', sun: 'rest',
        },
      }
    }

    const { data: inserted } = await supabase
      .from('weekly_plans')
      .insert({
        user_id: user.id,
        week_start: weekStart,
        split_type: planJson.split_type,
        day_slots: planJson.day_slots,
        model_used: model,
      })
      .select()
      .single()

    weeklyPlan = inserted as WeeklyPlan
  }

  // 2. Resolve today's focus.
  const focus: DayFocus = weeklyPlan.day_slots[dayKeyFor(now)] ?? 'rest'

  if (focus === 'rest') {
    return NextResponse.json({
      rest: true,
      weeklyPlan,
      focus,
    })
  }

  // 3. Ensure today's per-day suggestion exists.
  const { data: cached } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  if (cached) {
    return NextResponse.json({
      suggestion: cached.suggested_workout,
      weeklyPlan,
      focus,
    })
  }

  const prompt = buildWorkoutPrompt(profile, equipment ?? [], workoutsWithExercises, dayOfWeek, focus)

  let suggestedWorkout: SuggestedWorkout
  try {
    const raw = await callOpenRouter([{ role: 'user', content: prompt }], model)
    const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    suggestedWorkout = JSON.parse(clean)
  } catch {
    suggestedWorkout = {
      title: 'General Fitness',
      estimated_minutes: 45,
      muscle_groups: ['full body'],
      exercises: [
        { name: 'Bodyweight Squat', type: 'strength', sets: 3, reps: 12, weight_kg: 0, muscle_groups: ['legs'] },
        { name: 'Push-up', type: 'strength', sets: 3, reps: 10, weight_kg: 0, muscle_groups: ['chest', 'shoulders'] },
        { name: 'Walking', type: 'cardio', duration_minutes: 20, muscle_groups: ['cardio'] },
      ],
    }
  }

  await supabase.from('ai_suggestions').upsert({
    user_id: user.id,
    date: today,
    suggested_workout: suggestedWorkout,
    model_used: model,
  })

  return NextResponse.json({
    suggestion: suggestedWorkout,
    weeklyPlan,
    focus,
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors in this file. (Type errors in `dashboard/page.tsx` and `workout/[id]/page.tsx` are expected at this stage because consumers of the response shape haven't been updated yet.)

- [ ] **Step 3: Run all prompt tests once more to ensure nothing regressed**

```bash
pnpm test -- --testPathPattern=prompts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/suggest-workout/route.ts
git commit -m "feat(api): ensure weekly plan then resolve today's focus in suggest-workout"
```

---

## Task 8: New endpoint `/api/regenerate-weekly-plan`

**Files:**
- Create: `src/app/api/regenerate-weekly-plan/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/regenerate-weekly-plan/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { format, startOfWeek } from 'date-fns'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  await supabase.from('weekly_plans').delete().eq('user_id', user.id).eq('week_start', weekStart)
  await supabase.from('ai_suggestions').delete().eq('user_id', user.id).eq('date', today)

  // Delegate generation by calling the suggest-workout handler indirectly.
  // The caller will re-fetch /api/suggest-workout right after this, so we just return ok.
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/regenerate-weekly-plan/route.ts
git commit -m "feat(api): add regenerate-weekly-plan endpoint"
```

---

## Task 9: ExerciseLogger multi-set — failing test

**Files:**
- Modify: `src/components/__tests__/ExerciseLogger.test.tsx`

- [ ] **Step 1: Replace the test file**

Overwrite `src/components/__tests__/ExerciseLogger.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ExerciseLogger } from '@/components/ExerciseLogger'
import type { SuggestedExercise } from '@/lib/types'

const strengthExercise: SuggestedExercise = {
  name: 'Bench Press',
  type: 'strength',
  sets: 3,
  reps: 8,
  weight_kg: 80,
  muscle_groups: ['chest'],
}

const cardioExercise: SuggestedExercise = {
  name: 'Treadmill Run',
  type: 'cardio',
  duration_minutes: 20,
  muscle_groups: ['cardio'],
}

describe('ExerciseLogger — multi-set strength', () => {
  it('renders N rows for strength exercise where N = exercise.sets', () => {
    render(<ExerciseLogger exercise={strengthExercise} onComplete={jest.fn()} />)
    expect(screen.getAllByTestId('set-row')).toHaveLength(3)
  })

  it('pre-fills each row with the AI target weight and reps', () => {
    render(<ExerciseLogger exercise={strengthExercise} onComplete={jest.fn()} />)
    const weights = screen.getAllByTestId('set-weight') as HTMLInputElement[]
    const reps = screen.getAllByTestId('set-reps') as HTMLInputElement[]
    expect(weights.every(w => w.value === '80')).toBe(true)
    expect(reps.every(r => r.value === '8')).toBe(true)
  })

  it('adds a new row when "Add Set" is clicked', () => {
    render(<ExerciseLogger exercise={strengthExercise} onComplete={jest.fn()} />)
    fireEvent.click(screen.getByText(/add set/i))
    expect(screen.getAllByTestId('set-row')).toHaveLength(4)
  })

  it('calls onComplete with one exercise meta and N set entries', () => {
    const onComplete = jest.fn()
    render(<ExerciseLogger exercise={strengthExercise} onComplete={onComplete} />)

    const weights = screen.getAllByTestId('set-weight') as HTMLInputElement[]
    const reps = screen.getAllByTestId('set-reps') as HTMLInputElement[]

    fireEvent.change(weights[0], { target: { value: '60' } })
    fireEvent.change(reps[0], { target: { value: '10' } })
    fireEvent.change(weights[1], { target: { value: '70' } })
    fireEvent.change(reps[1], { target: { value: '8' } })
    fireEvent.change(weights[2], { target: { value: '80' } })
    fireEvent.change(reps[2], { target: { value: '6' } })

    fireEvent.click(screen.getByText(/complete exercise/i))

    expect(onComplete).toHaveBeenCalledTimes(1)
    const arg = onComplete.mock.calls[0][0]
    expect(arg.exercise.exercise_name).toBe('Bench Press')
    expect(arg.exercise.exercise_type).toBe('strength')
    expect(arg.sets).toHaveLength(3)
    expect(arg.sets[0]).toEqual(expect.objectContaining({ set_number: 1, weight_kg: 60, reps: 10 }))
    expect(arg.sets[1]).toEqual(expect.objectContaining({ set_number: 2, weight_kg: 70, reps: 8 }))
    expect(arg.sets[2]).toEqual(expect.objectContaining({ set_number: 3, weight_kg: 80, reps: 6 }))
  })
})

describe('ExerciseLogger — cardio', () => {
  it('shows duration field for cardio exercises', () => {
    render(<ExerciseLogger exercise={cardioExercise} onComplete={jest.fn()} />)
    expect(screen.getByPlaceholderText(/duration/i)).toBeInTheDocument()
  })

  it('calls onComplete with a single set entry for cardio', () => {
    const onComplete = jest.fn()
    render(<ExerciseLogger exercise={cardioExercise} onComplete={onComplete} />)
    fireEvent.change(screen.getByPlaceholderText(/duration/i), { target: { value: '25' } })
    fireEvent.click(screen.getByText(/complete exercise/i))

    expect(onComplete).toHaveBeenCalledTimes(1)
    const arg = onComplete.mock.calls[0][0]
    expect(arg.exercise.exercise_name).toBe('Treadmill Run')
    expect(arg.exercise.exercise_type).toBe('cardio')
    expect(arg.exercise.duration_minutes).toBe(25)
  })
})
```

- [ ] **Step 2: Run tests — verify failure**

```bash
pnpm test -- --testPathPattern=ExerciseLogger
```

Expected: FAIL with errors about `onComplete` prop not recognized, missing `set-row` testids, missing "Complete Exercise" button, etc.

- [ ] **Step 3: Commit (red phase)**

```bash
git add src/components/__tests__/ExerciseLogger.test.tsx
git commit -m "test(ExerciseLogger): rewrite for multi-set strength UX"
```

---

## Task 10: ExerciseLogger multi-set — implementation

**Files:**
- Modify: `src/components/ExerciseLogger.tsx`

- [ ] **Step 1: Rewrite the component**

Overwrite `src/components/ExerciseLogger.tsx`:

```tsx
'use client'

import { useState } from 'react'
import type { SuggestedExercise, WorkoutExercise, WorkoutSetInput } from '@/lib/types'

export interface CompletedExercise {
  exercise: Omit<WorkoutExercise, 'id' | 'workout_id'>
  sets: WorkoutSetInput[]
}

interface Props {
  exercise: SuggestedExercise
  onComplete: (payload: CompletedExercise) => void
  sortOrder?: number
}

interface SetRowState {
  weight: string
  reps: string
  effort: number
}

export function ExerciseLogger({ exercise, onComplete, sortOrder = 0 }: Props) {
  const initialSetCount = exercise.type === 'strength' ? (exercise.sets ?? 1) : 1

  const [rows, setRows] = useState<SetRowState[]>(
    Array.from({ length: initialSetCount }, () => ({
      weight: exercise.weight_kg?.toString() ?? '',
      reps: exercise.reps?.toString() ?? '',
      effort: 3,
    })),
  )
  const [duration, setDuration] = useState(exercise.duration_minutes?.toString() ?? '')
  const [cardioEffort, setCardioEffort] = useState(3)

  function updateRow(index: number, patch: Partial<SetRowState>) {
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows(prev => {
      const last = prev[prev.length - 1]
      return [...prev, last ? { ...last } : { weight: '', reps: '', effort: 3 }]
    })
  }

  function removeRow(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  function handleComplete() {
    if (exercise.type === 'strength') {
      const sets: WorkoutSetInput[] = rows.map((row, i) => ({
        set_number: i + 1,
        weight_kg: row.weight ? parseFloat(row.weight) : null,
        reps: row.reps ? parseInt(row.reps) : null,
        perceived_effort: row.effort,
      }))
      const avgEffort = Math.round(sets.reduce((s, r) => s + (r.perceived_effort ?? 3), 0) / sets.length)
      onComplete({
        exercise: {
          exercise_name: exercise.name,
          exercise_type: 'strength',
          sets: sets.length,
          reps: sets[0]?.reps ?? null,
          weight_kg: sets[0]?.weight_kg ?? null,
          duration_minutes: null,
          perceived_effort: avgEffort,
          sort_order: sortOrder,
        },
        sets,
      })
    } else {
      const dur = duration ? parseInt(duration) : null
      onComplete({
        exercise: {
          exercise_name: exercise.name,
          exercise_type: 'cardio',
          sets: null,
          reps: null,
          weight_kg: null,
          duration_minutes: dur,
          perceived_effort: cardioEffort,
          sort_order: sortOrder,
        },
        sets: [{ set_number: 1, weight_kg: null, reps: null, perceived_effort: cardioEffort }],
      })
    }
  }

  return (
    <div className="bg-surface-container rounded-xl border border-white/[0.06] p-sm flex flex-col gap-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-headline-md text-[20px] text-on-surface uppercase">{exercise.name}</h3>
          <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest mt-[2px]">
            {exercise.muscle_groups.join(' · ').toUpperCase()}
          </p>
          {exercise.notes && (
            <p className="font-body-md text-[14px] text-primary-container/70 mt-xs">{exercise.notes}</p>
          )}
        </div>
        <span className={`material-symbols-outlined text-[24px] ${exercise.type === 'cardio' ? 'text-secondary-container' : 'text-on-surface-variant/40'}`}>
          {exercise.type === 'cardio' ? 'directions_run' : 'fitness_center'}
        </span>
      </div>

      {exercise.type === 'strength' ? (
        <div className="flex flex-col gap-xs">
          <div className="grid grid-cols-12 gap-2 pb-[6px] border-b border-white/[0.06] font-label-caps text-[10px] text-on-surface-variant/50 text-center tracking-widest">
            <div className="col-span-1 text-left">#</div>
            <div className="col-span-3">KG</div>
            <div className="col-span-3">REPS</div>
            <div className="col-span-4">EFFORT</div>
            <div className="col-span-1"></div>
          </div>

          {rows.map((row, i) => (
            <div
              key={i}
              data-testid="set-row"
              className="grid grid-cols-12 gap-2 items-center bg-surface-container-high px-2 py-3 rounded-lg border border-white/[0.08] relative overflow-hidden"
            >
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary-container rounded-l-lg" />
              <div className="col-span-1 text-center font-mono text-[12px] text-on-surface-variant">{i + 1}</div>
              <div className="col-span-3">
                <input
                  data-testid="set-weight"
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={row.weight}
                  onChange={e => updateRow(i, { weight: e.target.value })}
                  className="w-full bg-surface-container text-center font-mono text-on-surface py-1.5 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
                />
              </div>
              <div className="col-span-3">
                <input
                  data-testid="set-reps"
                  type="number"
                  placeholder="0"
                  value={row.reps}
                  onChange={e => updateRow(i, { reps: e.target.value })}
                  className="w-full bg-surface-container text-center font-mono text-on-surface py-1.5 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
                />
              </div>
              <div className="col-span-4 flex items-center gap-1">
                <input
                  data-testid="set-effort"
                  type="range"
                  min={1}
                  max={5}
                  value={row.effort}
                  onChange={e => updateRow(i, { effort: parseInt(e.target.value) })}
                  className="w-full accent-[#c3f400]"
                />
                <span className="font-mono text-[11px] text-primary-container w-6 text-right">{row.effort}</span>
              </div>
              <div className="col-span-1 flex justify-end">
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(i)}
                    className="text-on-surface-variant/60 hover:text-error transition-colors"
                    aria-label="Remove set"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>
            </div>
          ))}

          <button
            onClick={addRow}
            className="self-start font-label-caps text-[11px] text-on-surface-variant hover:text-primary-container tracking-wider uppercase py-1 transition-colors"
          >
            + Add Set
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-sm">
          <div className="bg-surface-container-high px-2 py-3 rounded-lg border border-white/[0.08] relative overflow-hidden flex items-center gap-sm">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-secondary-container rounded-l-lg" />
            <input
              type="number"
              placeholder="Duration (min)"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className="flex-1 bg-surface-container text-center font-mono text-on-surface py-2 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <div className="flex items-center justify-between font-mono text-[11px] text-on-surface-variant/60">
              <span>EFFORT</span>
              <span className="text-primary-container">{cardioEffort}/5</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              value={cardioEffort}
              onChange={e => setCardioEffort(parseInt(e.target.value))}
              className="w-full accent-[#c3f400]"
            />
          </div>
        </div>
      )}

      <button
        onClick={handleComplete}
        className="bg-primary-container text-on-primary-container px-3 py-3 rounded-lg font-label-caps text-[12px] tracking-wider hover:brightness-110 active:scale-95 transition-all font-bold uppercase"
      >
        Complete Exercise
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Run the tests — expect pass**

```bash
pnpm test -- --testPathPattern=ExerciseLogger
```

Expected: all ExerciseLogger tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/ExerciseLogger.tsx
git commit -m "feat(ExerciseLogger): implement multi-set strength UI"
```

---

## Task 11: Update `workout/[id]/page.tsx` to consume the new payload

**Files:**
- Modify: `src/app/workout/[id]/page.tsx`

- [ ] **Step 1: Replace handler and finish flow**

Overwrite `src/app/workout/[id]/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ExerciseLogger, type CompletedExercise } from '@/components/ExerciseLogger'
import { SessionChat } from '@/components/SessionChat'
import { format } from 'date-fns'
import type { SuggestedWorkout } from '@/lib/types'

export default function WorkoutSessionPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [workout, setWorkout] = useState<SuggestedWorkout | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [logged, setLogged] = useState<CompletedExercise[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [startTime] = useState(new Date())

  useEffect(() => {
    async function loadSuggestion() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data } = await supabase
        .from('ai_suggestions')
        .select('suggested_workout')
        .eq('user_id', user.id)
        .eq('date', today)
        .single()
      if (data) setWorkout(data.suggested_workout as SuggestedWorkout)
    }
    loadSuggestion()
  }, [])

  function handleComplete(entry: CompletedExercise) {
    setLogged(prev => [...prev, { ...entry, exercise: { ...entry.exercise, sort_order: currentIndex } }])
    if (workout && currentIndex < workout.exercises.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }

  async function finishWorkout() {
    if (logged.length === 0 || !params.id) return
    setSaving(true)

    await supabase
      .from('workouts')
      .update({
        status: 'completed',
        duration_minutes: Math.round((Date.now() - startTime.getTime()) / 60000),
      })
      .eq('id', params.id as string)

    // Insert workout_exercises and capture their IDs so we can insert workout_sets.
    const { data: insertedExercises } = await supabase
      .from('workout_exercises')
      .insert(logged.map(l => ({ ...l.exercise, workout_id: params.id as string })))
      .select()

    if (insertedExercises) {
      const setRows = insertedExercises.flatMap((ex, i) =>
        logged[i].sets.map(s => ({
          workout_exercise_id: ex.id,
          set_number: s.set_number,
          weight_kg: s.weight_kg,
          reps: s.reps,
          perceived_effort: s.perceived_effort,
        })),
      )
      if (setRows.length > 0) {
        await supabase.from('workout_sets').insert(setRows)
      }
    }

    router.push('/dashboard')
  }

  if (!workout) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-primary-container animate-pulse">fitness_center</span>
          <p className="font-body-md text-body-md text-on-surface-variant mt-sm">Loading workout...</p>
        </div>
      </div>
    )
  }

  const currentExercise = workout.exercises[currentIndex]

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex justify-between items-center px-margin h-14">
          <button onClick={() => router.back()} className="text-on-surface-variant hover:text-primary-container transition-colors p-1 -ml-1">
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>
          <h1 className="font-headline-md text-[18px] text-primary-container uppercase tracking-wider truncate px-xs font-bold">
            {workout.title}
          </h1>
          <button
            onClick={() => setChatOpen(true)}
            className="text-on-surface-variant hover:text-primary-container transition-colors p-1.5 bg-surface-container-high rounded-full border border-white/[0.08]"
          >
            <span className="material-symbols-outlined text-[20px]">support_agent</span>
          </button>
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[120px] px-margin flex flex-col gap-md">
        <div className="flex items-center gap-xs bg-surface-container px-sm py-xs rounded-full border border-white/[0.08] self-start">
          <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
          <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Session Active</span>
        </div>

        <div>
          <p className="font-label-caps text-label-caps text-primary-container/70 tracking-widest mb-[4px]">
            EXERCISE {currentIndex + 1} OF {workout.exercises.length}
          </p>
          <h2 className="font-headline-lg text-[28px] text-on-surface uppercase leading-tight">
            {currentExercise.name}
          </h2>
        </div>

        <div className="flex gap-1">
          {workout.exercises.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i < currentIndex ? 'bg-primary-container' :
                i === currentIndex ? 'bg-primary-container/50' : 'bg-surface-container-high'
              }`}
            />
          ))}
        </div>

        <ExerciseLogger
          exercise={currentExercise}
          onComplete={handleComplete}
          sortOrder={currentIndex}
        />

        {logged.length > 0 && (
          <div className="flex flex-col gap-xs">
            <p className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">
              Logged ({logged.length})
            </p>
            {logged.map((entry, i) => (
              <div key={i} className="bg-surface-container rounded-xl px-sm py-xs flex items-center justify-between border border-white/[0.06]">
                <span className="font-body-md text-[15px] text-on-surface">{entry.exercise.exercise_name}</span>
                <span className="font-mono text-[12px] text-primary-container">
                  {entry.exercise.exercise_type === 'strength'
                    ? `${entry.sets.length} sets`
                    : `${entry.exercise.duration_minutes}min`}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-gradient-to-t from-background via-background/95 to-transparent pt-10 pb-6 px-margin z-40">
        <button
          onClick={finishWorkout}
          disabled={saving || logged.length === 0}
          className={`w-full font-label-caps text-[14px] py-4 rounded-xl transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-xs border font-bold tracking-wider ${
            logged.length > 0
              ? 'border-primary-container text-primary-container hover:bg-primary-container hover:text-on-primary-container'
              : 'border-white/10 text-on-surface-variant/30 cursor-not-allowed'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">flag</span>
          {saving ? 'SAVING...' : 'FINISH WORKOUT'}
        </button>
      </div>

      {chatOpen && (
        <SessionChat
          workout={workout}
          currentExercise={currentExercise.name}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add src/app/workout/[id]/page.tsx
git commit -m "feat(workout): persist per-set rows in finish flow"
```

---

## Task 12: Update `workout/log/page.tsx` for the new payload

**Files:**
- Modify: `src/app/workout/log/page.tsx`

- [ ] **Step 1: Switch handler + insert flow**

In `src/app/workout/log/page.tsx`, replace these three sections:

Replace the imports near the top:

```tsx
import { ExerciseLogger, type CompletedExercise } from '@/components/ExerciseLogger'
```

Replace the `logged` state and `handleLog` function:

```tsx
const [logged, setLogged] = useState<CompletedExercise[]>([])

function handleComplete(entry: CompletedExercise) {
  setLogged(prev => [...prev, { ...entry, exercise: { ...entry.exercise, sort_order: prev.length } }])
}
```

Replace `saveWorkout`:

```tsx
async function saveWorkout() {
  if (logged.length === 0) return
  setSaving(true)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: workoutRow } = await supabase
    .from('workouts')
    .insert({ user_id: user.id, date, status: 'completed' })
    .select()
    .single()

  if (workoutRow) {
    const { data: insertedExercises } = await supabase
      .from('workout_exercises')
      .insert(logged.map(l => ({ ...l.exercise, workout_id: workoutRow.id })))
      .select()

    if (insertedExercises) {
      const setRows = insertedExercises.flatMap((ex, i) =>
        logged[i].sets.map(s => ({
          workout_exercise_id: ex.id,
          set_number: s.set_number,
          weight_kg: s.weight_kg,
          reps: s.reps,
          perceived_effort: s.perceived_effort,
        })),
      )
      if (setRows.length > 0) {
        await supabase.from('workout_sets').insert(setRows)
      }
    }
  }

  router.push('/dashboard')
}
```

Replace the `<ExerciseLogger />` line:

```tsx
<ExerciseLogger exercise={activeExercise} onComplete={handleComplete} sortOrder={logged.length} />
```

Replace the "Logged" map block to use the new shape:

```tsx
{logged.map((entry, i) => (
  <div key={i} className="bg-surface-container rounded-xl px-sm py-xs flex items-center justify-between border border-white/[0.06]">
    <span className="font-body-md text-[15px] text-on-surface">{entry.exercise.exercise_name}</span>
    <span className="font-mono text-[12px] text-primary-container">
      {entry.exercise.exercise_type === 'strength'
        ? `${entry.sets.length} sets`
        : `${entry.exercise.duration_minutes}min`}
    </span>
  </div>
))}
```

Update the imports at the top of `workout/log/page.tsx` to remove `WorkoutExercise` (now unused) — the remaining type imports should be: `import type { SuggestedExercise } from '@/lib/types'`.

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/workout/log/page.tsx
git commit -m "feat(workout-log): persist per-set rows in post-workout flow"
```

---

## Task 13: Profile — add Preferred Split section and use shared equipment catalog

**Files:**
- Modify: `src/app/profile/page.tsx`

- [ ] **Step 1: Replace the file**

Overwrite `src/app/profile/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BottomNav } from '@/components/BottomNav'
import { useRouter } from 'next/navigation'
import type { FitnessLevel, SplitType } from '@/lib/types'
import { EQUIPMENT_CATALOG, EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/lib/equipmentCatalog'
import { SPLIT_OPTIONS } from '@/lib/splitOptions'

const FITNESS_LEVELS: Array<{ value: FitnessLevel; label: string; description: string }> = [
  { value: 'beginner', label: 'Beginner', description: '0–1 years training' },
  { value: 'intermediate', label: 'Intermediate', description: '1–3 years training' },
  { value: 'advanced', label: 'Advanced', description: '3+ years, specialized programming' },
]

const OPENROUTER_MODELS = [
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', description: 'Default — fast & accurate' },
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'Most capable reasoning' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', description: 'OpenAI flagship' },
  { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B', description: 'Open source powerhouse' },
]

export default function ProfilePage() {
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('intermediate')
  const [preferredSplit, setPreferredSplit] = useState<SplitType>('auto')
  const [equipment, setEquipment] = useState<string[]>([])
  const [customInput, setCustomInput] = useState('')
  const [model, setModel] = useState('deepseek/deepseek-chat')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: profile }, { data: eq }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('user_equipment').select('equipment_name').eq('user_id', user.id),
      ])
      if (profile) {
        setFitnessLevel(profile.fitness_level as FitnessLevel)
        setPreferredSplit((profile.preferred_split ?? 'auto') as SplitType)
      }
      setEquipment((eq ?? []).map(e => e.equipment_name))
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleEquipment(name: string) {
    const lower = name.toLowerCase()
    setEquipment(prev =>
      prev.includes(lower) ? prev.filter(e => e !== lower) : [...prev, lower]
    )
  }

  function selectAllInCategory(category: EquipmentCategory) {
    const names = EQUIPMENT_CATALOG.filter(i => i.category === category).map(i => i.name.toLowerCase())
    const allSelected = names.every(n => equipment.includes(n))
    setEquipment(prev => {
      if (allSelected) return prev.filter(e => !names.includes(e))
      const merged = new Set([...prev, ...names])
      return Array.from(merged)
    })
  }

  function addCustom() {
    const trimmed = customInput.trim().toLowerCase()
    if (!trimmed) return
    if (equipment.includes(trimmed)) return
    setEquipment(prev => [...prev, trimmed])
    setCustomInput('')
  }

  function removeCustom(name: string) {
    setEquipment(prev => prev.filter(e => e !== name))
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase
      .from('profiles')
      .update({ fitness_level: fitnessLevel, preferred_split: preferredSplit })
      .eq('id', user.id)
    await supabase.from('user_equipment').delete().eq('user_id', user.id)
    if (equipment.length > 0) {
      await supabase.from('user_equipment').insert(
        equipment.map(name => ({ user_id: user.id, equipment_name: name }))
      )
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const presetNamesLower = new Set(EQUIPMENT_CATALOG.map(i => i.name.toLowerCase()))
  const customEquipment = equipment.filter(e => !presetNamesLower.has(e))

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex justify-center items-center px-margin h-14">
          <h1 className="font-headline-lg text-[20px] text-primary-container uppercase tracking-wider font-bold">Profile</h1>
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[88px] px-margin flex flex-col gap-lg">
        <div className="pt-xs">
          <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Settings</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-[4px]">Customize your training profile</p>
        </div>

        {/* Fitness Level */}
        <section className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">Fitness Level</h3>
          <div className="flex flex-col gap-xs">
            {FITNESS_LEVELS.map(level => (
              <button
                key={level.value}
                onClick={() => setFitnessLevel(level.value)}
                className={`w-full text-left rounded-xl p-sm border transition-all duration-200 flex items-center justify-between ${
                  fitnessLevel === level.value
                    ? 'border-primary-container/40 bg-surface-container'
                    : 'border-white/[0.06] bg-surface-container hover:border-white/[0.12]'
                }`}
              >
                <div>
                  <p className="font-headline-md text-[18px] text-on-surface uppercase">{level.label}</p>
                  <p className="font-body-md text-[14px] text-on-surface-variant mt-[2px]">{level.description}</p>
                </div>
                {fitnessLevel === level.value && (
                  <span className="material-symbols-outlined text-primary-container text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Preferred Split */}
        <section className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">Preferred Split</h3>
          <div className="flex flex-col gap-xs">
            {SPLIT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPreferredSplit(opt.value)}
                className={`w-full text-left rounded-xl p-sm border transition-all duration-200 flex items-center justify-between ${
                  preferredSplit === opt.value
                    ? 'border-primary-container/40 bg-surface-container'
                    : 'border-white/[0.06] bg-surface-container hover:border-white/[0.12]'
                }`}
              >
                <div>
                  <p className="font-headline-md text-[18px] text-on-surface uppercase">{opt.label}</p>
                  <p className="font-body-md text-[14px] text-on-surface-variant mt-[2px]">{opt.description}</p>
                </div>
                {preferredSplit === opt.value && (
                  <span className="material-symbols-outlined text-primary-container text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Available Equipment */}
        <section id="equipment" className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">Available Equipment</h3>

          {(Object.keys(EQUIPMENT_CATEGORIES) as EquipmentCategory[]).map(cat => {
            const items = EQUIPMENT_CATALOG.filter(i => i.category === cat)
            return (
              <div key={cat} className="flex flex-col gap-xs">
                <div className="flex items-center justify-between">
                  <p className="font-label-caps text-[10px] text-on-surface-variant/50 tracking-widest uppercase">
                    {EQUIPMENT_CATEGORIES[cat]}
                  </p>
                  <button
                    onClick={() => selectAllInCategory(cat)}
                    className="font-label-caps text-[10px] text-primary-container/70 hover:text-primary-container tracking-wider uppercase"
                  >
                    Select all
                  </button>
                </div>
                <div className="flex flex-wrap gap-xs">
                  {items.map(it => (
                    <button
                      key={it.name}
                      onClick={() => toggleEquipment(it.name)}
                      className={`px-sm py-xs rounded-full text-[13px] border transition-all duration-200 font-medium ${
                        equipment.includes(it.name.toLowerCase())
                          ? 'border-primary-container/40 bg-primary-container/10 text-primary-container'
                          : 'border-white/[0.08] bg-surface-container-high text-on-surface-variant hover:border-white/[0.15]'
                      }`}
                    >
                      {it.name}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}

          {/* Custom equipment */}
          <div className="flex flex-col gap-xs mt-xs">
            <p className="font-label-caps text-[10px] text-on-surface-variant/50 tracking-widest uppercase">Custom</p>
            <div className="flex gap-xs">
              <input
                type="text"
                placeholder="Add custom equipment..."
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCustom() }}
                className="flex-1 bg-surface-container-high text-on-surface placeholder-on-surface-variant/40 rounded-lg px-sm py-xs border border-white/[0.08] focus:border-primary-container/50 outline-none font-body-md text-[14px] transition-colors"
              />
              <button
                onClick={addCustom}
                className="bg-primary-container text-on-primary-container px-sm py-xs rounded-lg font-label-caps text-[12px] tracking-wider hover:brightness-110 font-bold uppercase"
              >
                Add
              </button>
            </div>
            {customEquipment.length > 0 && (
              <div className="flex flex-wrap gap-xs mt-xs">
                {customEquipment.map(name => (
                  <span
                    key={name}
                    className="px-sm py-xs rounded-full text-[13px] border border-primary-container/40 bg-primary-container/10 text-primary-container flex items-center gap-xs"
                  >
                    {name}
                    <button onClick={() => removeCustom(name)} aria-label={`Remove ${name}`}>
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* AI Model */}
        <section className="flex flex-col gap-sm">
          <h3 className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">AI Model</h3>
          <div className="flex flex-col gap-xs">
            {OPENROUTER_MODELS.map(m => (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className={`w-full text-left p-sm rounded-xl border transition-all duration-200 flex items-center justify-between ${
                  model === m.id
                    ? 'border-primary-container/30 bg-surface-container'
                    : 'border-white/[0.06] bg-surface-container hover:border-white/[0.12]'
                }`}
              >
                <div>
                  <p className="font-body-md text-[15px] text-on-surface">{m.label}</p>
                  <p className="font-mono text-[11px] text-on-surface-variant/60 mt-[2px]">{m.description}</p>
                </div>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ml-sm transition-colors ${
                  model === m.id ? 'border-primary-container' : 'border-white/20'
                }`}>
                  {model === m.id && <div className="w-2.5 h-2.5 rounded-full bg-primary-container" />}
                </div>
              </button>
            ))}
          </div>
        </section>

        <button
          onClick={save}
          disabled={saving}
          className={`w-full font-label-caps text-[14px] py-3.5 rounded-xl uppercase tracking-wider transition-all font-bold ${
            saved
              ? 'bg-primary-container text-on-primary-container'
              : 'bg-primary-container text-on-primary-container hover:brightness-110 disabled:opacity-50'
          }`}
        >
          {saved ? '✓ SAVED' : saving ? 'SAVING...' : 'SAVE CHANGES'}
        </button>

        <button
          onClick={signOut}
          className="w-full flex items-center gap-sm p-sm bg-surface-container border border-white/[0.06] rounded-xl hover:bg-error-container/10 hover:border-error/20 transition-all group"
        >
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-error/70 group-hover:text-error transition-colors">
            <span className="material-symbols-outlined text-[20px]">logout</span>
          </div>
          <span className="font-body-md text-[16px] text-on-surface-variant group-hover:text-error transition-colors">Sign Out</span>
        </button>
      </main>

      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/profile/page.tsx
git commit -m "feat(profile): preferred-split section + categorized equipment + custom items"
```

---

## Task 14: Onboarding — use the categorized equipment catalog

**Files:**
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Replace the equipment step**

In `src/app/onboarding/page.tsx`, replace the `EQUIPMENT_OPTIONS` constant (lines 8–22) and the Step 3 markup (the `flex flex-wrap gap-xs flex-grow content-start` block under "Step 3: Equipment").

Replace the imports at the top with:

```tsx
import { EQUIPMENT_CATALOG, EQUIPMENT_CATEGORIES, type EquipmentCategory } from '@/lib/equipmentCatalog'
```

Remove the old `EQUIPMENT_OPTIONS` array entirely.

Replace the Step 3 list rendering with:

```tsx
<div className="flex flex-col gap-sm flex-grow overflow-y-auto">
  {(Object.keys(EQUIPMENT_CATEGORIES) as EquipmentCategory[]).map(cat => (
    <div key={cat} className="flex flex-col gap-xs">
      <p className="font-label-caps text-[10px] text-on-surface-variant/50 tracking-widest uppercase">
        {EQUIPMENT_CATEGORIES[cat]}
      </p>
      <div className="flex flex-wrap gap-xs">
        {EQUIPMENT_CATALOG.filter(i => i.category === cat).map(it => (
          <button
            key={it.name}
            onClick={() => toggleEquipment(it.name)}
            className={`px-sm py-xs rounded-full text-[13px] border transition-all duration-200 font-medium ${
              selectedEquipment.includes(it.name)
                ? 'border-primary-container/40 bg-primary-container/10 text-primary-container'
                : 'border-white/[0.08] bg-surface-container-high text-on-surface-variant hover:border-white/[0.15]'
            }`}
          >
            {it.name}
          </button>
        ))}
      </div>
    </div>
  ))}
</div>
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat(onboarding): use shared categorized equipment catalog"
```

---

## Task 15: WeeklyStrip — show focus labels under each day

**Files:**
- Modify: `src/components/WeeklyStrip.tsx`

- [ ] **Step 1: Accept `weeklyPlan` prop and render focus labels**

Overwrite `src/components/WeeklyStrip.tsx`:

```tsx
import { format, startOfWeek, addDays } from 'date-fns'
import type { Workout, WeeklyPlan, DayKey } from '@/lib/types'

interface Props {
  workouts: Workout[]
  weeklyPlan?: WeeklyPlan | null
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

const FOCUS_SHORT: Record<string, string> = {
  push: 'PUSH', pull: 'PULL', legs: 'LEGS',
  upper: 'UPR', lower: 'LWR', full_body: 'FULL',
  chest: 'CHST', back: 'BACK', shoulders: 'SHLD',
  arms: 'ARMS', core: 'CORE', rest: 'REST',
}

export function WeeklyStrip({ workouts, weeklyPlan }: Props) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <section aria-label="Weekly Workout Status">
      <div className="flex justify-between items-end bg-surface-container-low rounded-xl p-4 border border-white/5 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd')
          const isToday = dateStr === today
          const isFuture = dateStr > today
          const workout = workouts.find(w => w.date === dateStr)
          const focus = weeklyPlan?.day_slots?.[DAY_KEYS[i]]
          const focusLabel = focus ? FOCUS_SHORT[focus] ?? focus.toUpperCase() : null

          return (
            <div key={dateStr} className="flex flex-col items-center gap-xs relative">
              <span className={`font-label-caps text-label-caps ${isToday ? 'text-primary' : isFuture ? 'text-on-surface-variant opacity-50' : 'text-on-surface-variant'}`}>
                {DAY_LABELS[i]}
              </span>

              {isToday ? (
                <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center border-2 border-primary-container relative z-10 shadow-[0_0_15px_rgba(195,244,0,0.4)]">
                  <div className="w-2 h-2 rounded-full bg-primary-container" />
                </div>
              ) : workout?.status === 'completed' ? (
                <div className="w-8 h-8 rounded-full bg-primary-container/10 flex items-center justify-center border border-primary-container shadow-[0_0_12px_rgba(195,244,0,0.2)]">
                  <span className="material-symbols-outlined text-[16px] text-primary-container" style={{ fontVariationSettings: "'wght' 600" }}>check</span>
                </div>
              ) : workout?.status === 'skipped' ? (
                <div className="w-8 h-8 rounded-full bg-error-container/20 flex items-center justify-center border border-error">
                  <span className="material-symbols-outlined text-[16px] text-error" style={{ fontVariationSettings: "'wght' 600" }}>close</span>
                </div>
              ) : isFuture ? (
                <div className="w-8 h-8 rounded-full border border-dashed border-white/20 flex items-center justify-center opacity-50" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center border border-white/10 opacity-60">
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant" style={{ fontVariationSettings: "'wght' 300" }}>bed</span>
                </div>
              )}

              {focusLabel && (
                <span className={`font-mono text-[9px] tracking-widest ${focus === 'rest' ? 'text-on-surface-variant/40' : 'text-primary-container/70'}`}>
                  {focusLabel}
                </span>
              )}

              {isToday && (
                <div className="absolute -bottom-3 w-4 h-[2px] bg-primary-container rounded-full" />
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors in this file.

- [ ] **Step 3: Commit**

```bash
git add src/components/WeeklyStrip.tsx
git commit -m "feat(WeeklyStrip): show daily focus labels from weekly plan"
```

---

## Task 16: Dashboard — wire weekly plan, equipment chip, rest-day card

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Replace the page**

Overwrite `src/app/dashboard/page.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WeeklyStrip } from '@/components/WeeklyStrip'
import { WorkoutCard } from '@/components/WorkoutCard'
import { BottomNav } from '@/components/BottomNav'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Workout, SuggestedWorkout, WeeklyPlan, DayFocus } from '@/lib/types'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [suggestion, setSuggestion] = useState<SuggestedWorkout | null>(null)
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null)
  const [focus, setFocus] = useState<DayFocus | null>(null)
  const [isRestDay, setIsRestDay] = useState(false)
  const [todayWorkoutId, setTodayWorkoutId] = useState<string | null>(null)
  const [streak, setStreak] = useState(0)
  const [equipmentCount, setEquipmentCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function loadSuggestion() {
    const res = await fetch('/api/suggest-workout', { method: 'POST' })
    if (!res.ok) return
    const body = await res.json()
    setWeeklyPlan(body.weeklyPlan ?? null)
    setFocus(body.focus ?? null)
    if (body.rest) {
      setIsRestDay(true)
      setSuggestion(null)
    } else {
      setIsRestDay(false)
      setSuggestion(body.suggestion ?? null)
    }
  }

  async function regeneratePlan() {
    setRegenerating(true)
    await fetch('/api/regenerate-weekly-plan', { method: 'POST' })
    await loadSuggestion()
    setRegenerating(false)
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single()
      if (!profile) {
        router.push('/onboarding')
        return
      }

      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

      const [{ data: weekWorkouts }, { data: equipmentRows }] = await Promise.all([
        supabase.from('workouts').select('*').eq('user_id', user.id).gte('date', weekStart).lte('date', weekEnd),
        supabase.from('user_equipment').select('id').eq('user_id', user.id),
      ])

      setWorkouts(weekWorkouts ?? [])
      setEquipmentCount(equipmentRows?.length ?? 0)

      const today = format(new Date(), 'yyyy-MM-dd')
      const todayWorkout = (weekWorkouts ?? []).find(w => w.date === today)
      setTodayWorkoutId(todayWorkout?.id ?? null)

      const { data: allWorkouts } = await supabase
        .from('workouts')
        .select('date, status')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('date', { ascending: false })

      let s = 0
      const check = new Date()
      for (const w of allWorkouts ?? []) {
        if (w.date === format(check, 'yyyy-MM-dd')) {
          s++
          check.setDate(check.getDate() - 1)
        } else break
      }
      setStreak(s)

      try { await loadSuggestion() } catch {}

      setLoading(false)
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col min-h-screen">
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex justify-between items-center px-margin h-14">
          <h1 className="font-headline-lg text-[20px] text-primary-container uppercase tracking-wider font-bold">Elite Athlete</h1>
          <Link
            href="/profile"
            className="w-9 h-9 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-on-surface-variant hover:text-primary-container hover:border-primary-container/30 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">person</span>
          </Link>
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[88px] px-margin flex flex-col gap-md">
        <div className="pt-xs">
          <p className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase mb-[4px] tracking-widest">
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
          <h2 className="font-headline-lg text-[28px] text-on-surface uppercase leading-tight">{getGreeting()}</h2>
        </div>

        <WeeklyStrip workouts={workouts} weeklyPlan={weeklyPlan} />

        {/* Week plan card */}
        {weeklyPlan && (
          <section aria-label="Weekly Plan" className="bg-surface-container border border-white/[0.06] rounded-2xl p-md flex flex-col gap-xs">
            <div className="flex items-center justify-between">
              <p className="font-label-caps text-label-caps text-on-surface-variant/70 tracking-widest uppercase">
                This Week — {weeklyPlan.split_type.replace('_', ' ').toUpperCase()}
              </p>
              <button
                onClick={regeneratePlan}
                disabled={regenerating}
                className="font-label-caps text-[10px] text-primary-container/70 hover:text-primary-container tracking-wider uppercase disabled:opacity-40"
              >
                {regenerating ? 'Regenerating…' : 'Edit plan'}
              </button>
            </div>
          </section>
        )}

        {streak > 0 && (
          <section aria-label="Current Streak">
            <div className="bg-surface-container border border-white/[0.06] rounded-2xl p-md flex items-center gap-md overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-container/40 to-transparent" />
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary-container/10 border border-primary-container/20">
                <span className="material-symbols-outlined text-primary-container text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
              </div>
              <div className="flex-1">
                <p className="font-label-caps text-label-caps text-on-surface-variant/70 tracking-widest uppercase">Current Streak</p>
                <div className="flex items-baseline gap-xs">
                  <span className="font-mono text-[32px] font-bold text-primary-container leading-none">{streak}</span>
                  <span className="font-data-sm text-data-sm text-on-surface-variant">DAYS</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Today's Workout / Rest-day card */}
        {isRestDay ? (
          <section className="bg-surface-container border border-white/[0.06] rounded-2xl p-md flex flex-col gap-xs">
            <span className="material-symbols-outlined text-primary-container text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>bed</span>
            <h3 className="font-headline-md text-[20px] text-on-surface uppercase">Rest Day</h3>
            <p className="font-body-md text-[14px] text-on-surface-variant">
              Your plan has today as a rest day. Recover, hydrate, sleep well. You can still log an ad-hoc workout from below if you train today.
            </p>
          </section>
        ) : (
          <WorkoutCard workout={suggestion} loading={loading} />
        )}

        <section aria-label="Workout Actions" className="flex flex-col gap-xs">
          {!isRestDay && (todayWorkoutId ? (
            <Link
              href={`/workout/${todayWorkoutId}`}
              className="w-full relative overflow-hidden bg-primary-container text-on-primary-container font-label-caps text-[14px] py-4 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-xs font-bold tracking-wider"
            >
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
              START WORKOUT
            </Link>
          ) : (
            suggestion && (
              <button
                onClick={async () => {
                  const supabaseClient = createClient()
                  const { data: { user } } = await supabaseClient.auth.getUser()
                  if (!user) return
                  const today = format(new Date(), 'yyyy-MM-dd')
                  const { data } = await supabaseClient.from('workouts').insert({ user_id: user.id, date: today, status: 'completed' }).select().single()
                  if (data) setTodayWorkoutId(data.id)
                }}
                className="w-full relative overflow-hidden bg-primary-container text-on-primary-container font-label-caps text-[14px] py-4 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-xs font-bold tracking-wider"
              >
                <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                START WORKOUT
              </button>
            )
          ))}

          <Link
            href="/workout/log"
            className="w-full bg-surface-container border border-white/[0.08] text-on-surface-variant font-label-caps text-[13px] py-3.5 rounded-xl hover:bg-surface-container-high hover:border-white/[0.12] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-xs tracking-wider"
          >
            <span className="material-symbols-outlined text-[18px] opacity-60">history</span>
            LOG PAST WORKOUT
          </Link>

          {/* Equipment manage chip */}
          <Link
            href="/profile#equipment"
            className="w-full bg-surface-container-low border border-white/[0.06] text-on-surface-variant font-label-caps text-[11px] py-2.5 rounded-xl hover:bg-surface-container hover:border-white/[0.10] transition-all flex items-center justify-center gap-xs tracking-wider"
          >
            <span className="material-symbols-outlined text-[16px] opacity-60">fitness_center</span>
            EQUIPMENT: {equipmentCount} ITEMS · MANAGE
          </Link>
        </section>

        {/* Suppress unused warning for `focus` while keeping it in state for future debugging UI. */}
        {focus && <span className="sr-only">Focus: {focus}</span>}
      </main>

      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): wire weekly plan, equipment chip, rest-day card"
```

---

## Task 17: Full build + test pass

- [ ] **Step 1: Lint**

```bash
pnpm lint
```

Expected: zero errors. (Warnings about unused `WeeklyPlan` re-exports etc. are OK if any appear; do not introduce new lint errors.)

- [ ] **Step 2: Typecheck**

```bash
pnpm exec tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: all suites PASS (`prompts.test.ts`, `ExerciseLogger.test.tsx`).

- [ ] **Step 4: Run a Next.js build**

```bash
pnpm build
```

Expected: build completes successfully.

- [ ] **Step 5: Manual smoke (start dev server)**

```bash
pnpm dev
```

Open http://localhost:3000 and walk through:
1. Sign in. Confirm dashboard loads, "This week — …" panel renders, "Edit plan" button is visible.
2. Tap "Edit plan" → confirm the WeeklyStrip focus labels (PUSH/PULL/REST etc.) change.
3. Start today's workout. Confirm ExerciseLogger renders N rows for strength, each pre-filled. Edit a row's weight, add a set, complete the exercise. Advance through the workout, finish it.
4. Visit `/history`. Confirm the session shows N sets recorded.
5. Visit `/profile`. Confirm Preferred Split section appears between Fitness Level and Equipment, equipment is categorized, custom equipment input works.
6. If today's slot is `rest` in the AI's plan, confirm the rest-day card appears instead of a workout card.

Expected: every step completes without console errors.

- [ ] **Step 6: Commit any small fixes**

If any small adjustments were needed during smoke:

```bash
git add -p
git commit -m "fix: smoke-test adjustments"
```

If nothing changed, skip this step.

---

## Self-Review Notes

**Spec coverage check (against `docs/superpowers/specs/2026-05-11-per-set-logging-and-weekly-plan-design.md`):**

| Spec requirement | Task |
| --- | --- |
| `workout_sets` table + RLS | Task 1 |
| `weekly_plans` table + RLS | Task 1 |
| `profiles.preferred_split` | Task 1 |
| Backfill existing strength rows into `workout_sets` | Task 1 |
| New TS types (`SplitType`, `DayFocus`, `WorkoutSet`, `WeeklyPlan`) | Task 2 |
| Shared equipment catalog | Task 3 |
| `buildWeeklyPlanPrompt` honors `preferred_split` and `days_per_week` | Tasks 4–5 |
| `buildWorkoutPrompt` takes `dailyFocus` | Task 6 |
| `/api/suggest-workout` ensures weekly plan → resolves slot → caches daily | Task 7 |
| `/api/regenerate-weekly-plan` | Task 8 |
| Multi-set strength logger | Tasks 9–10 |
| Workout session inserts `workout_exercises` + `workout_sets` | Task 11 |
| Post-workout log page same flow | Task 12 |
| Profile Preferred Split, categorized equipment, custom input | Task 13 |
| Onboarding categorized equipment | Task 14 |
| WeeklyStrip shows focus labels | Task 15 |
| Dashboard rest-day card + equipment chip + week plan panel | Task 16 |
| Full lint/typecheck/test/build pass | Task 17 |
| Plan-shuffle-on-skip explicitly out of scope | Honored (no task) |

**Placeholder scan:** No "TBD", "TODO", "similar to", or vague handwaving in steps.

**Type consistency:**
- `CompletedExercise` (from `ExerciseLogger.tsx`) is consumed by `workout/[id]/page.tsx` and `workout/log/page.tsx` — same shape.
- `WeeklyPlan.day_slots` is `Record<DayKey, DayFocus>` — consumed by `WeeklyStrip` and the suggest-workout route — same shape.
- `Profile.preferred_split` added in Task 2, written in Task 13, read in Task 7 — matches.
- `WorkoutSetInput` defined in Task 2, produced in Task 10, consumed in Tasks 11 + 12 — matches.

---

## Execution Handoff

Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session, batching with checkpoints for review.

Which approach?
