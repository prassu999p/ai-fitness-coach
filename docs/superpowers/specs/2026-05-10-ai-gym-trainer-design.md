# AI Gym Trainer App — Design Spec

**Date:** 2026-05-10  
**Project:** `gym_trainer`  
**Status:** Approved — ready for implementation

---

## Context

A personal AI-powered gym trainer web app that suggests daily workouts based on history, tracks exercises automatically, and adapts progressively using an LLM via OpenRouter. Built as a mobile-first web app accessible on iPhone Safari — no App Store needed. Can be shared with friends via URL.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Database & Auth | Supabase (Postgres + Row-Level Security) |
| AI | OpenRouter API (default: `deepseek/deepseek-chat`) |
| Hosting | Vercel (free tier) |

---

## Architecture

```
iPhone Safari / Browser
        │
        ▼
  Next.js App (Vercel)
  ├── Mobile-first UI (Tailwind CSS)
  └── API Routes (server-side LLM calls — API key never exposed)
        │
        ├──► Supabase
        │    ├── Auth (email/password + magic link)
        │    ├── Postgres DB
        │    └── Row-level security (users see only their own data)
        │
        └──► OpenRouter API
             └── Pluggable model (DeepSeek / Claude / GPT-4o / any)
```

---

## Core Screens

### 1. Onboarding (new users only)
- Fitness level: Beginner / Intermediate / Advanced
- Days per week: 3 / 4 / 5 / 6
- Equipment checklist: barbells, dumbbells, cables, smith machine, pull-up bar, cardio machines, etc.
- AI picks a matching starter template (e.g., "3-day Full Body" or "5-day PPL")

### 2. Dashboard (home screen)
- Weekly strip — Mon–Sun tiles showing: completed / rest / skipped
- Current streak counter
- Today's AI-suggested workout card (muscle groups, estimated time)
- "Start Workout" and "Log Past Workout" entry points

### 3. Active Workout Session
- Exercises shown one at a time
- Strength: name, target sets/reps/weight, "Log Set" button
- Cardio: duration + perceived effort slider (1–5)
- Session chat button (bottom corner) — ask AI to swap or explain any exercise
- "Finish Workout" saves everything to history

### 4. Post-Workout Log (after-the-fact entry)
- Date picker for the workout date
- Same exercise logging UI as active session
- Saves to DB with the selected date

### 5. History / Progress
- Calendar view of past workouts
- Per-exercise weight-over-time graphs

### 6. Profile / Settings
- Edit equipment list
- Change fitness level
- OpenRouter model selector (power user feature)

---

## Data Model

```sql
-- Extended user profile
profiles (
  id            uuid references auth.users primary key,
  fitness_level text,       -- 'beginner' | 'intermediate' | 'advanced'
  days_per_week int,
  created_at    timestamptz default now()
)

-- Equipment the user has available
user_equipment (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id),
  equipment_name text
)

-- Individual workout sessions
workouts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references profiles(id),
  date             date,
  status           text,   -- 'completed' | 'skipped'
  notes            text,
  duration_minutes int,
  created_at       timestamptz default now()
)

-- Exercises logged within a session
workout_exercises (
  id               uuid primary key default gen_random_uuid(),
  workout_id       uuid references workouts(id),
  exercise_name    text,
  exercise_type    text,   -- 'strength' | 'cardio'
  sets             int,
  reps             int,
  weight_kg        numeric,
  duration_minutes int,    -- cardio only
  perceived_effort int,    -- 1–5 scale
  sort_order       int
)

-- Cached daily AI suggestions (generated once/day)
ai_suggestions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references profiles(id),
  date             date,
  suggested_workout jsonb,
  model_used       text,
  created_at       timestamptz default now()
)
```

Row-Level Security enabled on all tables.

---

## AI Integration

### 1. Daily Workout Generation
- Triggered once per day, result cached in `ai_suggestions`
- Prompt includes: fitness level, days/week, equipment list, last 7 days of workout history (exercises, sets, reps, weight, effort scores), recent muscle groups hit
- Returns: structured JSON workout — exercise list with target sets/reps/weight
- Cached so reopening the app doesn't burn API calls

### 2. Session Chat (exercise swap/substitution)
- On-demand during active workout only (session-scoped)
- Prompt includes: today's workout plan, the specific exercise in question, equipment list, user's message
- Returns: substitute exercise + brief reasoning
- Examples: "I don't have a cable machine", "what can I do instead of Romanian Deadlifts?"

### Model Configuration
```env
OPENROUTER_MODEL=deepseek/deepseek-chat   # default — cheap and fast
# Override to: anthropic/claude-sonnet-4-6, openai/gpt-4o, etc.
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| AI call fails | Use cached suggestion if available; fallback to conservative rule-based workout |
| New user, no history | Prompt instructs AI to start conservatively using profile data only |
| Offline | Show last loaded workout from browser cache; queue logs locally, sync on reconnect |

---

## Verification Checklist

1. Sign up → complete onboarding → starter workout appears on dashboard
2. Start workout → log 2–3 exercises → finish → confirm in history calendar
3. Next day → AI suggestion references previous session's muscle groups
4. Session chat → ask to swap exercise → AI returns equipment-compatible alternative
5. Open on iPhone Safari → layout is mobile-friendly, usable one-handed
6. Second user signs up → cannot see first user's data (RLS check)

---

## Future Enhancements (out of scope for v1)

- Import history from other apps (Strong, Hevy, Apple Health CSV)
- General "Ask your trainer" chat tab (not session-scoped)
- Expo / React Native native app wrapper
- Push notifications for workout reminders
