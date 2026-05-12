# Agentic AI Trainer — Design Spec
**Date:** 2026-05-12  
**Revised:** 2026-05-12 (post-review: RPE, state machine, context bloat, timezone, validation, human-in-loop, pivot logic, silent failure)  
**Status:** Approved  
**Branch:** feat/agentic-trainer

---

## Problem Statement

The current app is an LLM wrapper: user data is assembled into a single prompt, sent to OpenRouter, and the JSON response is rendered. There is no persistent trainer context, no committed training program, and no multi-step AI reasoning. Workouts are ad-hoc per day with no arc. There is also a bug where the dashboard holds a stale workout suggestion in React state across midnight, causing the wrong exercises to be snapshotted when "Start Workout" is clicked on a new day.

The goal is to rebuild the AI layer as a proper agentic trainer: one that writes and commits to a periodized training block, auto-regulates based on actual performance, and maintains a persistent coaching conversation with the user.

---

## Decisions Made

| Question | Decision |
|---|---|
| Agentic approach | Approach C — strategic agent loop (agent for planning/review/chat, fast call for session execution) |
| AI SDK | Vercel AI SDK — provider-agnostic, works with Anthropic + OpenRouter |
| Agent model | Claude Sonnet (`claude-sonnet-4-6`) via Anthropic provider |
| Fast model | DeepSeek Chat via OpenRouter provider |
| Program model | Committed periodized block (1–3 months) with session-level auto-regulation |
| Goal collection | Structured goal-setting screen — 4 steps including a Review & Edit step before committing |
| RPE tracking | RPE (1–10) stored per set in `workout_exercises.perceived_effort`; overload calculator is RPE-aware |
| Context window | `get_workout_history` returns summarised performance data for ranges >14 days; raw sets only for ≤14 days |
| Review-week trigger | State machine: `active → reviewing → completed`; failed reviews revert to `active` after 10-min window |
| Timezone handling | `ai_suggestions` and `program_weeks` keyed to the user's **local date** (sent from client as `YYYY-MM-DD`) |
| Program validation | Validation layer runs in `create_program` before writing to DB: normalises exercise names, checks volume feasibility |
| Review-week failure | Non-silent: Trainer tab shows "reviewing your week…" state and a Retry button if stuck >10 min |
| Pivot / life events | `shift_program` tool re-anchors remaining `program_weeks.week_start` dates forward by N days |
| Human-in-the-loop | Agent streams a high-level plan preview to the UI; user can request changes before committing to DB |
| CSV import | Day 2 feature — not in this spec |
| Proactive coaching | Dashboard cards + trainer chat messages (no OS push notifications) |
| Direction changes | User can request via trainer chat; trainer restructures remaining block as a named pivot event |

---

## Architecture

### Three-Tier AI Model

```
Tier 1 — Agent loop (Claude Sonnet)
  Routes: /api/trainer/generate-program
          /api/trainer/chat
          /api/trainer/review-week
  Pattern: multi-step tool use → stream response

Tier 2 — Fast call (DeepSeek via OpenRouter)
  Routes: /api/suggest-workout (updated)
          /api/session-chat (updated)
  Pattern: single prompt → JSON or text

Tier 3 — Pure TypeScript (no LLM)
  calculate_progressive_overload()   — RPE-aware
  validate_program()                 — exercise name normalisation + volume sanity check
  Program week lookup / slot resolution
```

### Key Principle

The **program block is the source of truth** for daily workouts. The agent writes the program once with full reasoning. The fast call reads the program and formats today's session. The agent only re-enters for trainer chat, weekly review, and program generation.

---

## Database Schema

### Migrations (applied in order)

**Migration 1 — Update profiles:**
```sql
ALTER TABLE profiles
  ADD COLUMN primary_goal text
    CHECK (primary_goal IN ('hypertrophy','strength','fat_loss','endurance','general_fitness')),
  ADD COLUMN goal_duration_weeks int,
  ADD COLUMN goal_set_at timestamptz;
```

**Migration 2 — training_programs:**
```sql
CREATE TABLE training_programs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal          text NOT NULL,
  duration_weeks int NOT NULL,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','paused')),
  phases        jsonb NOT NULL,
  week_plan     jsonb NOT NULL,
  model_used    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE training_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own programs"
  ON training_programs FOR ALL
  USING (user_id = auth.uid());
```

`phases` shape:
```json
[{ "name": "Hypertrophy Base", "week_range": [1, 4], "focus": "volume", "intensity": "moderate" }]
```

`week_plan` shape:
```json
{
  "1": {
    "mon": { "focus": "push", "exercises": [{ "name": "Bench Press", "sets": 4, "reps": 8, "weight_kg": 80 }] },
    "tue": { "focus": "pull", "exercises": [...] },
    "wed": { "focus": "rest" },
    ...
  },
  "2": { ... }
}
```

**Migration 3 — program_weeks:**
```sql
CREATE TABLE program_weeks (
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
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE program_weeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own program weeks"
  ON program_weeks FOR ALL
  USING (user_id = auth.uid());
```

> **`reviewing` status note:** The server atomically transitions `active → reviewing` before starting the review agent run. On success it transitions to `completed`. If the review crashes or times out, a background check reverts `reviewing → active` after 10 minutes (using `updated_at` as the timestamp). This prevents a failed run from permanently blocking future reviews.

**Migration 4 — trainer_messages:**
```sql
CREATE TABLE trainer_messages (
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
CREATE POLICY "users own messages"
  ON trainer_messages FOR ALL
  USING (user_id = auth.uid());
```

### Existing Tables

`ai_suggestions` — retained, same schema. Now populated by reading `training_programs.week_plan` rather than ad-hoc generation. Acts as a formatted session cache. **Date key is the user's local date (YYYY-MM-DD), sent in the request — not the server's UTC date.**

`weekly_plans` — superseded by `training_programs.week_plan`. Kept in DB for backward compatibility but no longer written to. The UI no longer reads from it.

---

## AI Agent Design

### Tool Definitions (`src/lib/agent/tools.ts`)

```ts
get_user_profile       ()                              → Profile + Equipment[]

get_workout_history    ({
  days: number,
  summarise?: boolean   // default true when days > 14; false for raw sets
})                                                     → PerformanceSummary[] | Workout[]
// PerformanceSummary shape:
// { exercise_name, estimated_1rm_trend_kg, weekly_volume_trend, last_rpe, sessions_count }
// Raw Workout[] (with exercises + sets) only returned when days <= 14.
// This prevents context window bloat for the 60-day generate-program call.

get_current_program    ()                              → training_programs row + active program_weeks row

get_exercise_performance ({ exercise_name: string })   → historical sets for one exercise, newest first

calculate_progressive_overload ({
  exercise_name: string,
  target_sets: number,
  target_reps: number,
  last_rpe?: number     // RPE 1–10 from most recent session; adjusts recommendation
})                                                     → { recommended_weight_kg, basis, confidence, rpe_note? }

create_program         ({ program: ProgramInput })     → validates via validate_program(), then inserts
                                                         training_programs + seeds program_weeks

adjust_program_week    ({
  week_number: number,
  adjustments: object,
  reasoning: string
})                                                     → updates program_weeks

shift_program          ({
  shift_days: number,   // positive = push forward (illness, travel, life)
  reason: string
})                                                     → updates week_start on all remaining program_weeks rows

add_trainer_message    ({ content: string, type: string, metadata?: object }) → inserts trainer_messages
get_trainer_history    ({ limit: number })             → trainer_messages[], newest first
```

`calculate_progressive_overload` is also exposed as a pure TypeScript function (no LLM) for the fast session generation path. It reads `perceived_effort` from the most recent set for that exercise and factors it into the recommended weight:
- RPE ≤ 6: increase load by an additional 2.5–5 kg
- RPE 7–8: standard progression
- RPE 9–10: hold weight or reduce; flag overreach risk

### `validate_program()` (`src/lib/agent/validateProgram.ts`)

Pure TypeScript, called inside `create_program` before any DB write:
1. Normalises exercise names against the canonical exercise list (e.g. "BB Row" → "Barbell Row")
2. Checks weekly volume is within physiologically plausible bounds (≤ 30 sets per muscle group per week)
3. Checks prescribed weights against user's logged maxima (±40% tolerance for new lifts)
4. Returns `{ valid: boolean, errors: string[], normalized: ProgramInput }`

If `valid === false`, the agent tool returns the error list so the agent can self-correct before retrying `create_program`.

### Agent Loop Routes

**`POST /api/trainer/generate-program`**

Trigger: User completes goal-setting screen and confirms their plan in the Review & Edit step.

Agent steps:
1. `get_user_profile` + `get_workout_history({ days: 60 })` — returns summarised `PerformanceSummary[]`, not raw sets
2. Reasons about fitness level, current capacity, goal, duration, equipment, preferred split
3. Designs a periodized block with 2–3 named phases, week-by-week exercise prescription
4. **Streams a high-level plan preview to the client** (phase names, week ranges, key lifts per phase) — UI shows this in the Review & Edit step (Step 3 of goal flow)
5. **Waits for user confirmation or change request** via a follow-up `POST /api/trainer/generate-program` with `{ action: 'confirm' | 'revise', feedback?: string }`
   - On `revise`: re-runs steps 2–4 incorporating `feedback`; max 3 revision rounds
   - On `confirm`: proceeds to step 6
6. `create_program({ program })` — validates + writes the block + seeds `program_weeks` rows
7. `add_trainer_message({ type: 'check_in', content: welcome + plan summary })`
8. Returns `{ program, firstWeekPreview }` to the UI

Max tool call rounds: 6 (to accommodate revision). Timeout per round-trip: 30s.

**`POST /api/trainer/chat`**

Trigger: User sends a message in the Trainer tab.

Request body: `{ message: string }`

Agent steps:
1. `get_trainer_history({ limit: 20 })` — restore conversation context
2. Tool calls as needed based on user message (any combination of the toolbox)
3. Streams response via `streamText`
4. Persists user message + trainer reply via `add_trainer_message` (both sides)

The agent may call `adjust_program_week` if the user requests a change, or `shift_program` if the user reports an absence or life event (e.g. "I've been sick for 10 days"). Changes are logged with `adjustment_notes` so the weekly review sees what was manually overridden.

Max tool call rounds: 6. Response: streamed.

**`POST /api/trainer/review-week`**

Trigger: Dashboard load on the first day of a new training week. Client checks: does the `program_weeks` row for the just-ended week have `status = 'active'`? If yes, fires the review.

State machine:
1. Server atomically updates `status = 'reviewing'`, `updated_at = now()` — prevents concurrent dashboard loads from double-triggering
2. If a row with `status = 'reviewing'` has `updated_at` older than 10 minutes, a subsequent dashboard load resets it to `status = 'active'` and re-triggers
3. On successful completion: `status = 'completed'`, `reviewed_at = now()`
4. On failure (timeout / exception): row stays `reviewing` until the 10-minute revert kicks in on next dashboard load

Agent steps:
1. `get_current_program` + `get_workout_history({ days: 7 })` — raw sets (≤ 14 days, no summarisation)
2. Compares `program_weeks.prescribed` vs actual logged volume, weights, RPE, adherence
3. Decides: on track / increase load / reduce volume / substitute exercises / shift program
4. `adjust_program_week({ week_number: next, adjustments, reasoning })`
5. `add_trainer_message({ type: 'weekly_review', content: summary with key adjustments })`

Max tool call rounds: 4. Timeout: 20s. Runs in background (non-blocking).

### Updated `POST /api/suggest-workout`

No agent loop. Request must include `localDate: string` (YYYY-MM-DD, derived from the client's timezone).

Steps:
1. Authenticate user
2. Fetch active `training_programs` + resolve the slot for `localDate` from `week_plan`
3. If today is a rest day → return `{ rest: true }`
4. If `ai_suggestions` cache exists for `localDate` → return it
5. Read today's prescribed exercises from `week_plan`
6. For each strength exercise call `calculate_progressive_overload()` (TypeScript, no LLM) with `last_rpe` from the most recent session
7. Format as `SuggestedWorkout`, upsert to `ai_suggestions` keyed by `(user_id, localDate)`, return

LLM only called here if the user has no active program (fallback to current ad-hoc behaviour).

---

## UI/UX Changes

### New: Goal-Setting Screen (`/onboarding/goals`)

4-step card flow, consistent with existing onboarding style:

- **Step 1 — Goal**: 5 selectable cards — Hypertrophy, Strength, Fat Loss, Endurance, General Fitness. Each has a one-line description.
- **Step 2 — Duration**: 3 buttons — 1 Month (4 weeks), 2 Months (8 weeks), 3 Months (12 weeks). Trainer note below explains optimal duration for chosen goal.
- **Step 3 — Review & Edit**: Shows animated progress while agent generates the plan. Renders a high-level plan card (phases list, week ranges, top 3 exercises per phase). Text input: "Want to change anything? (e.g. swap Barbell Rows for Pull-ups)". Confirm button ("Looks good, start my program") or send feedback to trigger a revision round. Max 3 revisions.
- **Step 4 — Confirm**: "Your program is ready" success screen with first-week preview. Navigates to dashboard on tap.

Reachable from: Onboarding (new step 4, after equipment), Profile page ("Change Program" button).

### Updated: Dashboard

Additions:
- **Program Progress Card** — below WeeklyStrip. Shows "Week 3 of 12 · Hypertrophy Block · Phase 1: Volume Base" with thin progress bar. Tapping expands to show all phases with week ranges and status (completed / active / upcoming).
- **Coaching Cards** — above today's workout card. Pulls `trainer_messages` where `message_type IN ('check_in','weekly_review','program_adjustment')` and `read_at IS NULL`. Dismissible (marks `read_at`). Styled with trainer avatar icon and primary-container glow.
- **"Prescribed" badge** — replaces "Suggested" badge on the workout card.

Removals:
- Weekly plan expandable section (replaced by Program Progress Card).

Bug fix — Start Workout button:
- Remove reliance on stale `suggestion` React state.
- On click: call `POST /api/suggest-workout` with `localDate` derived from `Intl.DateTimeFormat().resolvedOptions().timeZone` to get the freshest session (cache hit is fast), then insert the workout record with that response as `suggestion_snapshot`.
- Add `visibilitychange` event listener to re-run `loadSuggestion()` when tab becomes active — **but only if the user's local calendar date has changed since last load** (compare stored `loadDate` vs `new Date().toLocaleDateString('en-CA', { timeZone: userTz })`).

### New: Trainer Tab (`/trainer`)

Bottom nav gains a 4th tab: Home · Trainer · History · Profile. Trainer tab shows unread badge count.

Page layout:
- **Top section**: Program summary card (current week, phase, adherence %, next milestone).
- **Review-in-progress banner**: If active `program_weeks.status === 'reviewing'`, show "Your trainer is reviewing last week…" with a spinner. If `updated_at` is >10 min old (stale/crashed review), show "Something went wrong — Retry Review" button that resets status to `active` and re-triggers.
- **Bottom section**: Chat thread. Trainer messages left-aligned with a trainer avatar. User messages right-aligned. Streamed responses show a typing indicator. Input bar pinned to bottom.

Message types render differently:
- `weekly_review` — rendered as a structured card with stats, not plain text.
- `program_adjustment` — shows before/after comparison inline.
- `chat` — plain message bubble.

### Updated: Active Workout Session (`/workout/[id]`)

- Each exercise card shows prescribed targets from the program: "Target: 80 kg · 4×8" above the ExerciseLogger. Logger pre-fills weight from the program prescription.
- RPE selector (1–10 scale, emoji + number) added to each completed set in `ExerciseLogger`. Stored in `workout_exercises.perceived_effort`.
- Session chat overlay upgrades to multi-turn: sends full `trainer_messages` context, streams response, persists both sides. No longer a one-shot substitution tool.

---

## File Structure Changes

```
src/
  lib/
    agent/
      tools.ts              — all tool definitions (shared across routes)
      client.ts             — agentModel + fastModel exports
      validateProgram.ts    — exercise name normalisation + volume sanity checks
    progressiveOverload.ts  — pure TypeScript RPE-aware overload calculator
  app/
    api/
      trainer/
        generate-program/route.ts
        chat/route.ts
        review-week/route.ts
    onboarding/
      goals/page.tsx        — new 4-step goal-setting + review screen
    trainer/
      page.tsx              — new trainer chat tab (incl. reviewing state banner)
  components/
    ProgramCard.tsx         — program progress display
    CoachingCard.tsx        — dismissible trainer insight card
    TrainerChatThread.tsx   — message list + streamed input
    PlanPreviewCard.tsx     — high-level plan summary shown in Review & Edit step
    RpeSelector.tsx         — RPE 1–10 input used in ExerciseLogger
```

---

## Error Handling

- Agent routes have a hard timeout: 30s per round-trip for `generate-program`, 20s for `review-week`, 15s for `chat`. On timeout, return a fallback message and log the failure.
- `suggest-workout` falls back to ad-hoc LLM generation (current behaviour) if no active program exists.
- `review-week` failure is **not silent**:
  - The `program_weeks` row stays in `reviewing` status.
  - The Trainer tab shows "Your trainer is reviewing last week…" while `status === 'reviewing'`.
  - If `updated_at` is older than 10 minutes, the Trainer tab shows "Something went wrong — Retry Review". Tapping resets status to `active` via `PATCH /api/trainer/review-week/reset` and re-fires the review on the next dashboard load.
- `validate_program` errors are returned to the agent as tool output — the agent self-corrects and retries up to 2 times before surfacing an error to the user.
- Trainer chat streams — if the stream fails mid-response, the partial message is discarded and the user sees "Something went wrong, try again."

---

## What Is Not In This Spec (Day 2)

- CSV import of external workout history (Hevy, Strong, etc.)
- OS-level push notifications
- Exercise video / form guidance
- Social / sharing features
- Apple Health / Google Fit integration

---

## Milestones

| # | Name | Scope |
|---|---|---|
| 1 | Foundation | Bug fix (date-aware cache + timezone localDate) + profiles migration + training_programs + program_weeks (with `reviewing` status) + goal-setting screen (4 steps incl. Review & Edit) + generate-program agent (with preview streaming + revision loop + validate_program) + Vercel AI SDK setup |
| 2 | Smart Sessions | suggest-workout reads program block + RPE-aware progressive overload calculator + RpeSelector in ExerciseLogger + prescribed targets in workout UI |
| 3 | Trainer Chat | trainer_messages table + /trainer page (incl. reviewing state banner + retry button) + chat route (incl. shift_program support) + coaching cards on dashboard + bottom nav update |
| 4 | Weekly Review | review-week agent (state machine trigger + non-silent failure) + program adjustment display + program progress card on dashboard |
