# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start dev server (Next.js on http://localhost:3000)
pnpm build        # Production build
pnpm lint         # ESLint via next lint
pnpm test         # Run all Jest tests
pnpm test -- ExerciseLogger   # Run a single test file by name pattern
```

## Environment Variables

Create a `.env.local` file with:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ANTHROPIC_API_KEY=sk-ant-...
OPENROUTER_API_KEY=
OPENROUTER_MODEL=deepseek/deepseek-chat   # optional, this is the default
```

## Architecture

**Stack**: Next.js 14 App Router · TypeScript · Tailwind CSS · Supabase (auth + Postgres) · OpenRouter (AI) · Recharts · date-fns

**Mobile-first**: The entire app is constrained to `max-w-md` centered on screen. All pages use a fixed header + scrollable main + fixed bottom nav/action bar pattern.

### Supabase Integration

Two client factories with different contexts:
- `src/lib/supabase/client.ts` — browser client (`createBrowserClient`), used in `'use client'` page components
- `src/lib/supabase/server.ts` — async server client (`createServerClient`), used in API route handlers

**Never use the server client in client components or vice versa.** Auth state flows through cookies managed by `@supabase/ssr`.

**Middleware** (`src/middleware.ts`) protects all routes except `/login`, `/signup`, and Next.js internals. The `api/*` path is excluded from middleware matching — API routes do their own `supabase.auth.getUser()` check and return 401 if unauthenticated.

### Database Schema

Five tables, all with Row-Level Security enabled (users can only access their own rows):

| Table | Purpose |
|---|---|
| `profiles` | Extends `auth.users`; stores `fitness_level` and `days_per_week` |
| `user_equipment` | Equipment available to a user (e.g. "barbell", "dumbbells") |
| `workouts` | One row per session; `status` is `completed` or `skipped` |
| `workout_exercises` | Individual exercises within a workout; `exercise_type` is `strength` or `cardio` |
| `ai_suggestions` | Daily AI workout cached as JSONB; unique per `(user_id, date)` |

The `workout_exercises` RLS policy checks ownership through a join to `workouts` rather than a direct `user_id` column.

### AI Workout Generation Flow

`POST /api/suggest-workout`:
1. Returns cached `ai_suggestions` row if one exists for today
2. Fetches profile, equipment, and last 7 days of workouts (with exercises)
3. Calls `buildWorkoutPrompt()` to construct a structured prompt
4. Calls OpenRouter; strips markdown code fences and parses the JSON response
5. Falls back to a hardcoded bodyweight workout if parsing fails
6. Upserts the result to `ai_suggestions`

`POST /api/session-chat` — exercise substitution chat during an active workout. Takes `{ todayWorkout, exerciseName, userMessage }`, fetches user equipment, calls `buildSessionChatPrompt()`, and returns a 2–3 sentence text reply. Silently falls back to a static message on error.

The AI model is configured via `OPENROUTER_MODEL` env var; the default is `deepseek/deepseek-chat`. Users can select alternative models on the Profile page, but this only takes effect if the env var is updated and the server restarted (the UI selection is cosmetic-only currently).

### Page Flow

1. **Auth** (`/login`, `/signup`) — Supabase email/password auth
2. **Onboarding** (`/onboarding`) — 3-step wizard: fitness level → days/week → equipment. Writes to `profiles` and `user_equipment`. Dashboard redirects here if no profile exists.
3. **Dashboard** (`/dashboard`) — Fetches this week's workouts, calculates streak, fetches AI suggestion
4. **Active Session** (`/workout/[id]`) — Steps through AI-suggested exercises one by one using `ExerciseLogger`. Opens `SessionChat` overlay for AI substitution help. On finish, updates the `workouts` row status and bulk-inserts `workout_exercises`.
5. **Log Past Workout** (`/workout/log`) — Manual retroactive logging with a common-exercise picker
6. **History** (`/history`) — Last 60 workouts list + `ProgressChart` for per-exercise strength progression
7. **Profile** (`/profile`) — Edit fitness level, equipment, view model options; replace-all pattern for equipment (delete all then re-insert)

### Design System

Custom Tailwind tokens in `tailwind.config.ts`:
- **Colors**: Dark surfaces (`#131313` base), neon green `primary-container` (`#c3f400`), cyan `secondary-container`
- **Fonts**: Anton (display/headlines), Lexend (body), JetBrains Mono (data/numbers)
- **Custom utilities** in `globals.css`: `glow-primary`, `glow-primary-active`, `inner-glow`, `ambient-bg`

Use semantic color tokens (e.g. `text-on-surface-variant`, `bg-surface-container-high`) rather than raw hex values to stay consistent with the design system.

### Type Definitions

All shared types live in `src/lib/types.ts`. The `SuggestedWorkout` / `SuggestedExercise` types represent the AI output structure; `Workout` / `WorkoutExercise` represent persisted DB rows. These are structurally similar but distinct — `SuggestedExercise` has `muscle_groups[]` and `notes?`, while `WorkoutExercise` has `workout_id`, `perceived_effort`, and `sort_order`.

### Testing

Tests live in `__tests__/` subdirectories next to the code they test. The jest config uses `ts-jest` with `jsdom` environment and maps `@/` to `src/`. `jest.setup.ts` imports `@testing-library/jest-dom` matchers.

Current test coverage targets: `ExerciseLogger` component (render + interaction) and `buildWorkoutPrompt` / `buildSessionChatPrompt` pure functions. API routes and Supabase interactions are not tested; mock accordingly if adding tests.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current
