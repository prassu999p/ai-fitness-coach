# Per-Set Logging, Weekly Plan, Splits, and Equipment Editor

**Date:** 2026-05-11
**Branch:** `feat/per-set-logging-and-weekly-plan`
**Status:** Design — awaiting user review

## Problem

The current gym trainer app has four shortcomings that the user wants addressed in one feature branch:

1. **Single-tuple set logging.** `ExerciseLogger` records one (sets, reps, weight) tuple per exercise. In reality each set can have different weight and reps (warm-up sets, drop sets, RPE pyramids), and the user cannot capture this.
2. **AI suggests only "today's workout."** There is no weekly view, no rest-day planning, and no way to see "what am I doing the rest of the week."
3. **AI defaults to full-body routines.** There is no concept of training splits (PPL, Upper/Lower, body-part), so the prompt cannot produce push days, pull days, etc.
4. **Equipment editor is shallow and hidden.** The preset list has 13 items, no custom entry, and no entry point on the dashboard — users never update it.

## Goals

- Record per-set actuals (weight, reps, effort) so history charts and AI progression have real data.
- Generate a weekly *template* (Mon → Sun, focus per day) at week start; regenerate today's specific exercises each morning against that template.
- Let the user pick a preferred split (Auto / Full body / Upper-Lower / PPL / Body-part) in profile, with Auto as the default so the AI chooses based on `days_per_week`.
- Expand the equipment catalog, group it by category, support free-text custom items, and add a "Manage equipment" entry point to the dashboard.

## Non-goals

- Mid-week plan re-shuffling. If the user skips Tuesday's push day, the slot stays "push, skipped" — it does not slide forward.
- Cross-week periodization (deload weeks, mesocycles). Out of scope.
- Per-set notes or per-set rest timers. Out of scope.
- A DB-integration test layer. RLS will be hand-verified on the Supabase project.

## Approach

**Approach A — Schema-rich** was chosen over a JSON-blob alternative (Approach B). A separate `workout_sets` table makes the history page's weight-progression chart trivially queryable at set granularity; a separate `weekly_plans` table separates the *weekly template* from the *daily exercise cache* (`ai_suggestions`). The trade-off is four migrations vs. two columns; the user accepted that cost.

## Data model

### Migration `002_per_set_and_weekly_plan.sql`

**New table `workout_sets`** — one row per set actually performed.

```sql
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
```

**Existing table `workout_exercises`** — `sets`, `reps`, `weight_kg`, `duration_minutes`, `perceived_effort` are kept but reinterpreted as **AI target values** (suggested by the AI; nullable). Per-set actuals live in `workout_sets`. Existing rows are backfilled with one `workout_sets` row replaying the current `sets/reps/weight_kg/perceived_effort` (best-effort historical preservation).

```sql
insert into workout_sets (workout_exercise_id, set_number, weight_kg, reps, perceived_effort)
select we.id, 1, we.weight_kg, we.reps, we.perceived_effort
from workout_exercises we
where we.exercise_type = 'strength'
  and we.weight_kg is not null;
```

**New table `weekly_plans`** — weekly split template assigned at week start.

```sql
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
```

`day_slots` schema (JSON):

```json
{
  "mon": "push",
  "tue": "pull",
  "wed": "legs",
  "thu": "rest",
  "fri": "upper",
  "sat": "lower",
  "sun": "rest"
}
```

Valid focus values: `push`, `pull`, `legs`, `upper`, `lower`, `full_body`, `chest`, `back`, `shoulders`, `arms`, `core`, `rest`. The set is intentionally a small enum-like vocabulary the AI is instructed to use.

`week_start` is always the Monday of the week (matches existing `startOfWeek({ weekStartsOn: 1 })` usage in the dashboard).

**Existing table `profiles`** — gains `preferred_split`.

```sql
alter table profiles
  add column preferred_split text not null default 'auto'
    check (preferred_split in ('auto','full_body','upper_lower','ppl','body_part'));
```

**Equipment** — no schema change. `user_equipment.equipment_name` is already `text`, so a free-text custom equipment input simply inserts a row.

### TypeScript types (`src/lib/types.ts`)

```ts
export type SplitType = 'auto' | 'full_body' | 'upper_lower' | 'ppl' | 'body_part';
export type DayFocus  =
  | 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body'
  | 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'rest';

export interface WorkoutSet {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  perceived_effort: number | null;
}

export interface WeeklyPlan {
  id: string;
  user_id: string;
  week_start: string;            // ISO date
  split_type: SplitType;
  day_slots: Record<'mon'|'tue'|'wed'|'thu'|'fri'|'sat'|'sun', DayFocus>;
  model_used: string;
}

// Profile gains preferred_split:
export interface Profile {
  // ...existing fields...
  preferred_split: SplitType;
}
```

## AI prompts (`src/lib/prompts.ts`)

### (a) New: `buildWeeklyPlanPrompt(profile, equipment, recentWorkouts, weekStartDate)`

Inputs:
- `profile.preferred_split` — if not `'auto'`, the prompt instructs the AI to honor it.
- `profile.days_per_week`
- Last 14 days of workouts so the AI varies from the prior week.

Output schema (strict JSON):

```json
{
  "split_type": "ppl",
  "rationale": "string (≤ 2 sentences)",
  "day_slots": {
    "mon": "push", "tue": "pull", "wed": "legs",
    "thu": "rest", "fri": "push", "sat": "pull", "sun": "rest"
  }
}
```

The number of non-`rest` slots must equal `days_per_week`.

### (b) Updated: `buildWorkoutPrompt(profile, equipment, recentWorkouts, dayOfWeek, dailyFocus)`

New required argument `dailyFocus: DayFocus`. Prompt now:
- Instructs the AI to pick exercises whose `muscle_groups` strictly match the focus (push → chest/shoulders/triceps, pull → back/biceps/rear delts, legs → quads/hamstrings/glutes/calves, etc.).
- Reads `workout_sets` (via `recentWorkouts[i].exercises[j].sets[]`) for progressive-overload reasoning, not the single (`sets × reps @ weight`) tuple.
- Returns the same `SuggestedWorkout` JSON schema as today.

### (c) Unchanged: `buildSessionChatPrompt(...)`

## API routes

### `/api/suggest-workout` (refactored)

Pseudocode:

```
ensureWeeklyPlan(user, today):
  weekStart = startOfWeek(today, monday)
  plan = select from weekly_plans where user_id=$user and week_start=$weekStart
  if not plan:
    plan = callAI(buildWeeklyPlanPrompt(...))
    insert into weekly_plans
  return plan

handler():
  user = auth.getUser()
  plan = ensureWeeklyPlan(user, today)
  focus = plan.day_slots[dayKey(today)]
  if focus == 'rest':
    return { rest: true, weeklyPlan: plan }
  suggestion = select from ai_suggestions where user_id=$user and date=$today
  if not suggestion:
    suggestion = callAI(buildWorkoutPrompt(..., focus))
    insert into ai_suggestions
  return { suggestion, weeklyPlan: plan, focus }
```

### `/api/regenerate-weekly-plan` (new)

POST. Deletes the current week's `weekly_plans` row and today's `ai_suggestions` row, then runs `ensureWeeklyPlan` and returns the new plan. Used by the "Edit plan" link on the dashboard.

## UI changes

### `ExerciseLogger.tsx` — multi-set strength variant

- Strength branch renders `N` editable rows where `N = exercise.sets` (the AI target).
- Header row stays `KG · REPS · EFFORT`; each row is its own input set pre-filled with the AI target.
- The first un-completed row gets the green left-accent (current "active row" treatment).
- "Add set" button at the bottom of the rows for ad-hoc extra sets.
- Each row past the AI target shows a small remove icon.
- A single sticky "Complete Exercise" button replaces per-row "Log Set."
- On Complete Exercise: parent receives `{ exercise: WorkoutExerciseMeta, sets: WorkoutSetInput[] }` and writes both `workout_exercises` row and N `workout_sets` rows.
- Cardio branch is unchanged.

### `workout/[id]/page.tsx` and `workout/log/page.tsx`

- `handleLog` becomes `handleCompleteExercise` and stages `{ exercise, sets[] }` per exercise in local state.
- `finishWorkout` first inserts `workout_exercises` (returning IDs), then inserts the corresponding `workout_sets` rows in a second batch.

### `profile/page.tsx`

- New section **Preferred Split** between Fitness Level and Equipment: 5 selectable cards (Auto / Full body / Upper-Lower / PPL / Body-part). Persists to `profiles.preferred_split`.
- **Available Equipment** section:
  - Categorized presets with headers: *Free Weights* (Barbell, Dumbbells, EZ-bar, Kettlebells, Plates, Bench, Rack), *Machines* (Smith Machine, Cables, Lat Pulldown, Leg Press, Leg Curl, Leg Extension, Hack Squat, Pec Deck, Chest Press, Row Machine, Hyperextension), *Cardio* (Treadmill, Stationary Bike, Rowing Machine, Stairmaster, Assault Bike, Elliptical), *Accessories* (Pull-up Bar, Dip Bars, Resistance Bands, TRX, Battle Ropes, Medicine Balls, Foam Roller, Box).
  - Each category header has a "Select all" pill.
  - A free-text "Add custom" input at the bottom of the section. Submitted strings are inserted as removable chips and saved as `user_equipment` rows.

### `onboarding/page.tsx` — step 3

Uses the same categorized list as profile but without the free-text custom input (keep onboarding fast — custom items belong in profile).

### `dashboard/page.tsx`

- `WeeklyStrip` (in `src/components/WeeklyStrip.tsx`) is extended: in addition to the existing completed/skipped status dots, each day shows a small focus label beneath it (PUSH / PULL / REST / etc.) pulled from this week's `weekly_plans.day_slots`. Today's day is highlighted.
- New small panel above `WorkoutCard`: **"This week's plan"** with the 7 day-slot labels and an **"Edit plan"** link that POSTs to `/api/regenerate-weekly-plan`.
- New small chip near the bottom of the dashboard: **"Equipment: N items · Manage"** linking to `/profile#equipment`.
- If today's slot is `rest`, the dashboard shows a rest-day card instead of a `WorkoutCard`. Rest is a hint — the user can still tap "Log past workout" to record an ad-hoc session if they end up training on a planned rest day.

## Testing

- `src/components/__tests__/ExerciseLogger.test.tsx` — rewritten for the multi-set strength variant: asserts that N rows render when `exercise.sets = 3`, that "Add set" appends a row, that "Complete Exercise" emits a payload with the right shape (one exercise meta + N set entries).
- `src/lib/__tests__/prompts.test.ts` — expanded with cases for `buildWeeklyPlanPrompt` (auto vs. specific split, days-per-week constraint on non-rest slot count) and for the focus-aware `buildWorkoutPrompt` (push-day prompt mentions chest/shoulders/triceps and excludes legs).
- RLS for `workout_sets` and `weekly_plans` is hand-verified on Supabase (no automated DB tests in this repo).

## Out-of-scope notes

- Plan reshuffling on skip is explicitly out of scope (see Non-goals).
- The two new tables and the `preferred_split` column are forward-only — no rollback migration is shipped. A backout would require dropping the new tables and removing the column manually.
