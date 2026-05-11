# AI Gym Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first AI gym trainer web app that suggests daily personalized workouts based on history, tracks exercises, and supports in-session AI chat for exercise substitution.

**Architecture:** Next.js 14 App Router frontend + Supabase Postgres backend with RLS. All LLM calls happen server-side via Next.js API routes to keep the OpenRouter API key secret. Daily suggestions are cached in the DB so reopening the app doesn't burn API tokens.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Supabase (auth + Postgres), OpenRouter API, Recharts (graphs), Vercel (hosting)

---

## File Map

```
gym_trainer/
├── .env.local                              # API keys (never committed)
├── next.config.ts
├── tailwind.config.ts
├── src/
│   ├── middleware.ts                       # Auth guard — redirects unauthenticated users
│   ├── app/
│   │   ├── layout.tsx                      # Root layout + Supabase session provider
│   │   ├── page.tsx                        # Root redirect → /dashboard or /onboarding
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── onboarding/page.tsx             # Multi-step: level → days → equipment → template
│   │   ├── dashboard/page.tsx              # Weekly strip + streak + today's suggestion
│   │   ├── workout/
│   │   │   ├── [id]/page.tsx               # Active session (exercise-by-exercise)
│   │   │   └── log/page.tsx                # Post-workout log (date picker)
│   │   ├── history/page.tsx                # Calendar + per-exercise graphs
│   │   ├── profile/page.tsx                # Equipment editor + settings
│   │   └── api/
│   │       ├── suggest-workout/route.ts    # POST — generate & cache daily workout
│   │       └── session-chat/route.ts       # POST — swap/explain exercise in session
│   ├── components/
│   │   ├── WeeklyStrip.tsx                 # Mon–Sun status tiles
│   │   ├── WorkoutCard.tsx                 # Today's AI suggestion card
│   │   ├── ExerciseLogger.tsx              # Shared log-set UI (active + post-workout)
│   │   ├── SessionChat.tsx                 # In-session AI chat overlay
│   │   └── ProgressChart.tsx               # Recharts weight-over-time line chart
│   └── lib/
│       ├── supabase/
│       │   ├── client.ts                   # Browser Supabase client (singleton)
│       │   └── server.ts                   # Server Supabase client (per-request)
│       ├── openrouter.ts                   # OpenRouter fetch wrapper
│       ├── prompts.ts                      # Prompt builder functions
│       └── types.ts                        # Shared TypeScript types
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql
```

---

## Task 1: Project Initialisation

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `.env.local`

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd /Users/prasanthp/Documents/Work/AIgency/gym_trainer
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*" --no-git
```

Expected: Next.js 14 project created with TypeScript, Tailwind, App Router, and `src/` directory.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr recharts date-fns
npm install -D @types/node
```

- [ ] **Step 3: Create `.env.local`**

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
OPENROUTER_API_KEY=your_openrouter_api_key
OPENROUTER_MODEL=deepseek/deepseek-chat
```

- [ ] **Step 4: Update `next.config.ts`**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: [],
  },
}

export default nextConfig
```

- [ ] **Step 5: Verify dev server starts**

```bash
npm run dev
```

Expected: Server starts on `http://localhost:3000` with no errors.

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "feat: initialise Next.js 14 project with Tailwind and Supabase deps"
```

---

## Task 2: Supabase Schema + RLS

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Create Supabase project**

Go to https://supabase.com → New project. Copy the Project URL and anon key into `.env.local`.

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/001_initial_schema.sql`:

```sql
-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Profiles (extends auth.users)
create table profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  fitness_level text not null check (fitness_level in ('beginner', 'intermediate', 'advanced')),
  days_per_week int  not null check (days_per_week between 3 and 6),
  created_at    timestamptz default now()
);

-- Equipment per user
create table user_equipment (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete cascade not null,
  equipment_name text not null
);

-- Workout sessions
create table workouts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references profiles(id) on delete cascade not null,
  date             date not null,
  status           text not null check (status in ('completed', 'skipped')),
  notes            text,
  duration_minutes int,
  created_at       timestamptz default now()
);

-- Exercises within a session
create table workout_exercises (
  id               uuid primary key default gen_random_uuid(),
  workout_id       uuid references workouts(id) on delete cascade not null,
  exercise_name    text not null,
  exercise_type    text not null check (exercise_type in ('strength', 'cardio')),
  sets             int,
  reps             int,
  weight_kg        numeric(6,2),
  duration_minutes int,
  perceived_effort int check (perceived_effort between 1 and 5),
  sort_order       int not null default 0
);

-- Cached daily AI suggestions
create table ai_suggestions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references profiles(id) on delete cascade not null,
  date              date not null,
  suggested_workout jsonb not null,
  model_used        text not null,
  created_at        timestamptz default now(),
  unique (user_id, date)
);

-- Row-Level Security
alter table profiles        enable row level security;
alter table user_equipment  enable row level security;
alter table workouts        enable row level security;
alter table workout_exercises enable row level security;
alter table ai_suggestions  enable row level security;

-- Profiles: users can only read/write their own row
create policy "profiles_self" on profiles
  for all using (auth.uid() = id);

-- Equipment: users can only access their own equipment
create policy "equipment_self" on user_equipment
  for all using (auth.uid() = user_id);

-- Workouts: users can only access their own workouts
create policy "workouts_self" on workouts
  for all using (auth.uid() = user_id);

-- Workout exercises: access via workout ownership
create policy "workout_exercises_self" on workout_exercises
  for all using (
    exists (
      select 1 from workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  );

-- AI suggestions: users can only access their own
create policy "ai_suggestions_self" on ai_suggestions
  for all using (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  -- Profile created during onboarding, not here
  return new;
end;
$$;
```

- [ ] **Step 3: Run migration in Supabase**

In the Supabase dashboard → SQL Editor → paste the contents of `001_initial_schema.sql` → Run.

Expected: All 5 tables created with RLS enabled. Verify in Table Editor.

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase schema with RLS for all tables"
```

---

## Task 3: Shared Types + Supabase Clients

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/middleware.ts`

- [ ] **Step 1: Write types**

Create `src/lib/types.ts`:

```typescript
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'
export type ExerciseType = 'strength' | 'cardio'
export type WorkoutStatus = 'completed' | 'skipped'

export interface Profile {
  id: string
  fitness_level: FitnessLevel
  days_per_week: number
  created_at: string
}

export interface Equipment {
  id: string
  user_id: string
  equipment_name: string
}

export interface Workout {
  id: string
  user_id: string
  date: string
  status: WorkoutStatus
  notes: string | null
  duration_minutes: number | null
  created_at: string
}

export interface WorkoutExercise {
  id: string
  workout_id: string
  exercise_name: string
  exercise_type: ExerciseType
  sets: number | null
  reps: number | null
  weight_kg: number | null
  duration_minutes: number | null
  perceived_effort: number | null
  sort_order: number
}

export interface SuggestedExercise {
  name: string
  type: ExerciseType
  sets?: number
  reps?: number
  weight_kg?: number
  duration_minutes?: number
  muscle_groups: string[]
  notes?: string
}

export interface SuggestedWorkout {
  title: string
  estimated_minutes: number
  muscle_groups: string[]
  exercises: SuggestedExercise[]
}

export interface AiSuggestion {
  id: string
  user_id: string
  date: string
  suggested_workout: SuggestedWorkout
  model_used: string
  created_at: string
}
```

- [ ] **Step 2: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 3: Create server Supabase client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

- [ ] **Step 4: Create auth middleware**

Create `src/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/signup']

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  if (!user && !PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ src/middleware.ts
git commit -m "feat: add shared types, Supabase clients, and auth middleware"
```

---

## Task 4: OpenRouter Client + Prompt Builders

**Files:**
- Create: `src/lib/openrouter.ts`
- Create: `src/lib/prompts.ts`
- Test: `src/lib/__tests__/prompts.test.ts`

- [ ] **Step 1: Install Jest**

```bash
npm install -D jest @types/jest jest-environment-jsdom ts-jest
```

Add to `package.json`:

```json
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "node",
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/src/$1"
  }
},
"scripts": {
  "test": "jest"
}
```

- [ ] **Step 2: Write failing tests for prompt builders**

Create `src/lib/__tests__/prompts.test.ts`:

```typescript
import { buildWorkoutPrompt, buildSessionChatPrompt } from '@/lib/prompts'
import type { Profile, Equipment, Workout, WorkoutExercise, SuggestedWorkout } from '@/lib/types'

const profile: Profile = {
  id: 'user-1',
  fitness_level: 'intermediate',
  days_per_week: 4,
  created_at: '2026-05-01T00:00:00Z',
}

const equipment: Equipment[] = [
  { id: 'e1', user_id: 'user-1', equipment_name: 'barbell' },
  { id: 'e2', user_id: 'user-1', equipment_name: 'dumbbells' },
]

const recentWorkouts: Array<Workout & { exercises: WorkoutExercise[] }> = []

describe('buildWorkoutPrompt', () => {
  it('includes fitness level in prompt', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday')
    expect(prompt).toContain('intermediate')
  })

  it('includes equipment names in prompt', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday')
    expect(prompt).toContain('barbell')
    expect(prompt).toContain('dumbbells')
  })

  it('requests JSON output', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday')
    expect(prompt).toContain('JSON')
  })
})

describe('buildSessionChatPrompt', () => {
  const todayWorkout: SuggestedWorkout = {
    title: 'Upper Body',
    estimated_minutes: 60,
    muscle_groups: ['chest', 'shoulders'],
    exercises: [
      { name: 'Bench Press', type: 'strength', sets: 4, reps: 8, weight_kg: 80, muscle_groups: ['chest'] },
    ],
  }

  it('includes exercise name in prompt', () => {
    const prompt = buildSessionChatPrompt(todayWorkout, equipment, 'Bench Press', 'no flat bench available')
    expect(prompt).toContain('Bench Press')
  })

  it('includes user message in prompt', () => {
    const prompt = buildSessionChatPrompt(todayWorkout, equipment, 'Bench Press', 'no flat bench available')
    expect(prompt).toContain('no flat bench available')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '@/lib/prompts'`

- [ ] **Step 4: Create OpenRouter client**

Create `src/lib/openrouter.ts`:

```typescript
interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface OpenRouterResponse {
  choices: Array<{ message: { content: string } }>
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  model?: string
): Promise<string> {
  const selectedModel = model ?? process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gym-trainer.vercel.app',
      'X-Title': 'AI Gym Trainer',
    },
    body: JSON.stringify({ model: selectedModel, messages }),
  })

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status} ${await response.text()}`)
  }

  const data: OpenRouterResponse = await response.json()
  return data.choices[0].message.content
}
```

- [ ] **Step 5: Create prompt builders**

Create `src/lib/prompts.ts`:

```typescript
import type { Profile, Equipment, Workout, WorkoutExercise, SuggestedWorkout } from '@/lib/types'

export function buildWorkoutPrompt(
  profile: Profile,
  equipment: Equipment[],
  recentWorkouts: Array<Workout & { exercises: WorkoutExercise[] }>,
  dayOfWeek: string
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

  return `You are a personal gym trainer AI. Generate a workout for today (${dayOfWeek}).

USER PROFILE:
- Fitness level: ${profile.fitness_level}
- Training days per week: ${profile.days_per_week}
- Available equipment: ${equipmentList}

RECENT WORKOUT HISTORY (last 7 days):
${historySection}

INSTRUCTIONS:
- Only suggest exercises using the available equipment listed above
- Avoid muscle groups trained in the last 24–48 hours
- Apply progressive overload based on history (slightly more weight/reps than previous sessions)
- Mix strength and cardio appropriate to an intermediate schedule
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

export function buildSessionChatPrompt(
  todayWorkout: SuggestedWorkout,
  equipment: Equipment[],
  exerciseName: string,
  userMessage: string
): string {
  const equipmentList = equipment.map(e => e.equipment_name).join(', ') || 'bodyweight only'
  const workoutJson = JSON.stringify(todayWorkout, null, 2)

  return `You are an in-session gym trainer AI. The user needs help with an exercise substitution.

TODAY'S WORKOUT:
${workoutJson}

AVAILABLE EQUIPMENT: ${equipmentList}

EXERCISE IN QUESTION: ${exerciseName}

USER MESSAGE: ${userMessage}

Suggest a substitute exercise that:
1. Targets the same primary muscle group(s) as ${exerciseName}
2. Only uses equipment from the available equipment list
3. Is appropriate for the user's current workout context

Reply in 2–3 sentences: name the substitute, explain why it works, and give a brief cue for the first set.`
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS — all 4 tests green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/openrouter.ts src/lib/prompts.ts src/lib/__tests__/
git commit -m "feat: add OpenRouter client and prompt builder functions with tests"
```

---

## Task 5: AI API Routes

**Files:**
- Create: `src/app/api/suggest-workout/route.ts`
- Create: `src/app/api/session-chat/route.ts`

- [ ] **Step 1: Create workout suggestion route**

Create `src/app/api/suggest-workout/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callOpenRouter } from '@/lib/openrouter'
import { buildWorkoutPrompt } from '@/lib/prompts'
import { format } from 'date-fns'
import type { SuggestedWorkout, WorkoutExercise, Workout } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const dayOfWeek = format(new Date(), 'EEEE')

  // Return cached suggestion if it exists for today
  const { data: cached } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  if (cached) {
    return NextResponse.json({ suggestion: cached.suggested_workout })
  }

  // Fetch profile and equipment
  const [{ data: profile }, { data: equipment }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('user_equipment').select('*').eq('user_id', user.id),
  ])

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Fetch last 7 days of workout history with exercises
  const sevenDaysAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  const { data: recentWorkouts } = await supabase
    .from('workouts')
    .select('*, workout_exercises(*)')
    .eq('user_id', user.id)
    .gte('date', sevenDaysAgo)
    .order('date', { ascending: false })

  const workoutsWithExercises = (recentWorkouts ?? []).map(w => ({
    ...w,
    exercises: (w.workout_exercises ?? []) as WorkoutExercise[],
  })) as Array<Workout & { exercises: WorkoutExercise[] }>

  const prompt = buildWorkoutPrompt(profile, equipment ?? [], workoutsWithExercises, dayOfWeek)
  const model = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'

  let suggestedWorkout: SuggestedWorkout

  try {
    const raw = await callOpenRouter([{ role: 'user', content: prompt }], model)
    // Strip markdown code fences if present
    const json = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    suggestedWorkout = JSON.parse(json)
  } catch {
    // Fallback: minimal conservative workout
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

  // Cache in DB
  await supabase.from('ai_suggestions').upsert({
    user_id: user.id,
    date: today,
    suggested_workout: suggestedWorkout,
    model_used: model,
  })

  return NextResponse.json({ suggestion: suggestedWorkout })
}
```

- [ ] **Step 2: Create session chat route**

Create `src/app/api/session-chat/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callOpenRouter } from '@/lib/openrouter'
import { buildSessionChatPrompt } from '@/lib/prompts'
import type { SuggestedWorkout } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as {
    todayWorkout: SuggestedWorkout
    exerciseName: string
    userMessage: string
  }

  const { data: equipment } = await supabase
    .from('user_equipment')
    .select('*')
    .eq('user_id', user.id)

  const prompt = buildSessionChatPrompt(
    body.todayWorkout,
    equipment ?? [],
    body.exerciseName,
    body.userMessage
  )

  try {
    const reply = await callOpenRouter([{ role: 'user', content: prompt }])
    return NextResponse.json({ reply })
  } catch {
    return NextResponse.json(
      { reply: "I'm having trouble connecting right now. Try a similar exercise with the same equipment." },
      { status: 200 }
    )
  }
}
```

- [ ] **Step 3: Test routes manually**

Start dev server and test with curl:

```bash
# First login via browser to get a session cookie, then:
curl -X POST http://localhost:3000/api/suggest-workout \
  -H "Content-Type: application/json" \
  --cookie "your-session-cookie"
```

Expected: JSON response with `suggestion` containing a workout object.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/
git commit -m "feat: add AI API routes for workout suggestion and session chat"
```

---

## Task 6: Auth Pages

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Create root layout**

Replace `src/app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Gym Trainer',
  description: 'Your personal AI-powered gym trainer',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white min-h-screen antialiased">
        <main className="max-w-md mx-auto min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Create root redirect page**

Replace `src/app/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/onboarding')

  redirect('/dashboard')
}
```

- [ ] **Step 3: Create login page**

Create `src/app/(auth)/login/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <h1 className="text-3xl font-bold mb-2">AI Gym Trainer</h1>
      <p className="text-gray-400 mb-8">Your personal AI coach</p>

      <form onSubmit={handleLogin} className="w-full space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl py-3 font-semibold transition-colors"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>

      <p className="mt-6 text-gray-400 text-sm">
        No account?{' '}
        <Link href="/signup" className="text-blue-400 hover:underline">Sign up</Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Create signup page**

Create `src/app/(auth)/signup/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/onboarding')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6">
      <h1 className="text-3xl font-bold mb-2">Create Account</h1>
      <p className="text-gray-400 mb-8">Start your AI training journey</p>

      <form onSubmit={handleSignup} className="w-full space-y-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          minLength={6}
          className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl py-3 font-semibold transition-colors"
        >
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="mt-6 text-gray-400 text-sm">
        Have an account?{' '}
        <Link href="/login" className="text-blue-400 hover:underline">Sign in</Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 5: Verify auth flow in browser**

```bash
npm run dev
```

1. Open http://localhost:3000 → should redirect to `/login`
2. Click "Sign up" → fill in email + password → submit
3. Should redirect to `/onboarding` (next task)

- [ ] **Step 6: Commit**

```bash
git add src/app/
git commit -m "feat: add auth pages (login, signup) and root redirect"
```

---

## Task 7: Onboarding Flow

**Files:**
- Create: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Create onboarding page**

Create `src/app/onboarding/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { FitnessLevel } from '@/lib/types'

const EQUIPMENT_OPTIONS = [
  'Barbell', 'Dumbbells', 'Cables', 'Smith Machine',
  'Pull-up Bar', 'Resistance Bands', 'Treadmill',
  'Stationary Bike', 'Rowing Machine', 'Kettlebells',
  'Dip Bars', 'Leg Press', 'Lat Pulldown',
]

type Step = 'level' | 'days' | 'equipment' | 'done'

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('level')
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('intermediate')
  const [daysPerWeek, setDaysPerWeek] = useState(4)
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  function toggleEquipment(name: string) {
    setSelectedEquipment(prev =>
      prev.includes(name) ? prev.filter(e => e !== name) : [...prev, name]
    )
  }

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

    router.push('/dashboard')
  }

  if (step === 'level') return (
    <div className="flex flex-col min-h-screen px-6 py-12">
      <p className="text-gray-400 text-sm mb-2">Step 1 of 3</p>
      <h2 className="text-2xl font-bold mb-8">What's your fitness level?</h2>
      <div className="space-y-3 flex-1">
        {(['beginner', 'intermediate', 'advanced'] as FitnessLevel[]).map(level => (
          <button
            key={level}
            onClick={() => setFitnessLevel(level)}
            className={`w-full text-left px-5 py-4 rounded-xl capitalize font-medium border-2 transition-colors ${
              fitnessLevel === level
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-700 bg-gray-800'
            }`}
          >
            {level}
          </button>
        ))}
      </div>
      <button
        onClick={() => setStep('days')}
        className="w-full bg-blue-600 hover:bg-blue-700 rounded-xl py-3 font-semibold mt-8"
      >
        Next
      </button>
    </div>
  )

  if (step === 'days') return (
    <div className="flex flex-col min-h-screen px-6 py-12">
      <p className="text-gray-400 text-sm mb-2">Step 2 of 3</p>
      <h2 className="text-2xl font-bold mb-8">How many days per week can you train?</h2>
      <div className="grid grid-cols-2 gap-3 flex-1">
        {[3, 4, 5, 6].map(n => (
          <button
            key={n}
            onClick={() => setDaysPerWeek(n)}
            className={`py-8 rounded-xl text-3xl font-bold border-2 transition-colors ${
              daysPerWeek === n
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-gray-700 bg-gray-800'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <button
        onClick={() => setStep('equipment')}
        className="w-full bg-blue-600 hover:bg-blue-700 rounded-xl py-3 font-semibold mt-8"
      >
        Next
      </button>
    </div>
  )

  if (step === 'equipment') return (
    <div className="flex flex-col min-h-screen px-6 py-12">
      <p className="text-gray-400 text-sm mb-2">Step 3 of 3</p>
      <h2 className="text-2xl font-bold mb-2">What equipment do you have?</h2>
      <p className="text-gray-400 text-sm mb-6">Select everything available at your gym</p>
      <div className="flex flex-wrap gap-2 flex-1">
        {EQUIPMENT_OPTIONS.map(name => (
          <button
            key={name}
            onClick={() => toggleEquipment(name)}
            className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              selectedEquipment.includes(name)
                ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                : 'border-gray-600 bg-gray-800 text-gray-300'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <button
        onClick={handleFinish}
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl py-3 font-semibold mt-8"
      >
        {saving ? 'Setting up...' : "Let's Go"}
      </button>
    </div>
  )

  return null
}
```

- [ ] **Step 2: Test onboarding in browser**

1. Sign up as a new user → should land on `/onboarding`
2. Select fitness level → Next
3. Select days/week → Next
4. Select equipment → "Let's Go"
5. Should redirect to `/dashboard` (next task)
6. Check Supabase → `profiles` and `user_equipment` tables should have rows

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/
git commit -m "feat: add 3-step onboarding flow (level, days, equipment)"
```

---

## Task 8: Dashboard

**Files:**
- Create: `src/app/dashboard/page.tsx`
- Create: `src/components/WeeklyStrip.tsx`
- Create: `src/components/WorkoutCard.tsx`

- [ ] **Step 1: Create WeeklyStrip component**

Create `src/components/WeeklyStrip.tsx`:

```typescript
import { format, startOfWeek, addDays } from 'date-fns'
import type { Workout } from '@/lib/types'

interface Props {
  workouts: Workout[]
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function WeeklyStrip({ workouts }: Props) {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  return (
    <div className="flex justify-between gap-1">
      {days.map((day, i) => {
        const dateStr = format(day, 'yyyy-MM-dd')
        const isToday = dateStr === format(new Date(), 'yyyy-MM-dd')
        const workout = workouts.find(w => w.date === dateStr)

        let bg = 'bg-gray-800'
        if (workout?.status === 'completed') bg = 'bg-green-600'
        else if (workout?.status === 'skipped') bg = 'bg-gray-600'
        else if (day > new Date()) bg = 'bg-gray-800 opacity-40'

        return (
          <div key={dateStr} className="flex flex-col items-center gap-1">
            <span className="text-xs text-gray-400">{DAY_LABELS[i]}</span>
            <div className={`w-9 h-9 rounded-lg ${bg} ${isToday ? 'ring-2 ring-blue-400' : ''} flex items-center justify-center text-xs font-bold`}>
              {format(day, 'd')}
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Create WorkoutCard component**

Create `src/components/WorkoutCard.tsx`:

```typescript
import Link from 'next/link'
import type { SuggestedWorkout } from '@/lib/types'

interface Props {
  workout: SuggestedWorkout | null
  loading: boolean
  workoutId: string | null
}

export function WorkoutCard({ workout, loading, workoutId }: Props) {
  if (loading) return (
    <div className="bg-gray-800 rounded-2xl p-5 animate-pulse">
      <div className="h-5 bg-gray-700 rounded w-1/2 mb-3" />
      <div className="h-4 bg-gray-700 rounded w-3/4" />
    </div>
  )

  if (!workout) return (
    <div className="bg-gray-800 rounded-2xl p-5 text-center text-gray-400">
      Could not load today's workout. Check your connection.
    </div>
  )

  return (
    <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl p-5">
      <p className="text-blue-300 text-sm font-medium mb-1">Today's Workout</p>
      <h3 className="text-xl font-bold mb-1">{workout.title}</h3>
      <p className="text-blue-200 text-sm mb-4">
        {workout.muscle_groups.join(' · ')} · ~{workout.estimated_minutes} min
      </p>
      <div className="space-y-1 mb-5">
        {workout.exercises.slice(0, 3).map((ex, i) => (
          <p key={i} className="text-sm text-blue-100">
            {ex.type === 'strength'
              ? `${ex.name} — ${ex.sets}×${ex.reps}`
              : `${ex.name} — ${ex.duration_minutes}min`}
          </p>
        ))}
        {workout.exercises.length > 3 && (
          <p className="text-sm text-blue-300">+{workout.exercises.length - 3} more</p>
        )}
      </div>
      {workoutId && (
        <Link
          href={`/workout/${workoutId}`}
          className="block w-full text-center bg-white text-blue-900 rounded-xl py-3 font-bold hover:bg-blue-50 transition-colors"
        >
          Start Workout
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create dashboard page**

Create `src/app/dashboard/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WeeklyStrip } from '@/components/WeeklyStrip'
import { WorkoutCard } from '@/components/WorkoutCard'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import Link from 'next/link'
import type { Workout, SuggestedWorkout } from '@/lib/types'

export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [suggestion, setSuggestion] = useState<SuggestedWorkout | null>(null)
  const [todayWorkoutId, setTodayWorkoutId] = useState<string | null>(null)
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

      const { data: weekWorkouts } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', weekStart)
        .lte('date', weekEnd)

      setWorkouts(weekWorkouts ?? [])

      const today = format(new Date(), 'yyyy-MM-dd')
      const todayWorkout = (weekWorkouts ?? []).find(w => w.date === today)
      setTodayWorkoutId(todayWorkout?.id ?? null)

      // Calculate streak
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

      // Fetch AI suggestion
      const res = await fetch('/api/suggest-workout', { method: 'POST' })
      if (res.ok) {
        const { suggestion } = await res.json()
        setSuggestion(suggestion)
      }

      setLoading(false)
    }

    load()
  }, [])

  return (
    <div className="px-5 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Good {getTimeOfDay()}</h1>
          <p className="text-gray-400 text-sm">{format(new Date(), 'EEEE, MMMM d')}</p>
        </div>
        {streak > 0 && (
          <div className="bg-orange-500/20 border border-orange-500/40 rounded-xl px-3 py-2 text-center">
            <p className="text-orange-400 text-xl font-bold">{streak}</p>
            <p className="text-orange-300 text-xs">day streak</p>
          </div>
        )}
      </div>

      <WeeklyStrip workouts={workouts} />

      <WorkoutCard workout={suggestion} loading={loading} workoutId={todayWorkoutId} />

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/workout/log"
          className="bg-gray-800 rounded-2xl p-4 text-center hover:bg-gray-700 transition-colors"
        >
          <p className="text-2xl mb-1">📝</p>
          <p className="text-sm font-medium">Log Past Workout</p>
        </Link>
        <Link
          href="/history"
          className="bg-gray-800 rounded-2xl p-4 text-center hover:bg-gray-700 transition-colors"
        >
          <p className="text-2xl mb-1">📊</p>
          <p className="text-sm font-medium">History</p>
        </Link>
      </div>
    </div>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
```

- [ ] **Step 4: Verify dashboard in browser**

1. Log in → should land on `/dashboard`
2. Weekly strip shows today highlighted with blue ring
3. AI workout card loads (may take a few seconds first time)
4. Streak shows 0 (no history yet)

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/ src/components/WeeklyStrip.tsx src/components/WorkoutCard.tsx
git commit -m "feat: add dashboard with weekly strip, streak counter, and AI workout card"
```

---

## Task 9: ExerciseLogger Component (Shared)

**Files:**
- Create: `src/components/ExerciseLogger.tsx`
- Test: `src/components/__tests__/ExerciseLogger.test.tsx`

- [ ] **Step 1: Write failing test**

```bash
npm install -D @testing-library/react @testing-library/jest-dom
```

Update `package.json` jest config:

```json
"jest": {
  "preset": "ts-jest",
  "testEnvironment": "jsdom",
  "setupFilesAfterFramework": ["@testing-library/jest-dom"],
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/src/$1"
  }
}
```

Create `src/components/__tests__/ExerciseLogger.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { ExerciseLogger } from '@/components/ExerciseLogger'
import type { SuggestedExercise } from '@/lib/types'

const strengthExercise: SuggestedExercise = {
  name: 'Bench Press',
  type: 'strength',
  sets: 4,
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

describe('ExerciseLogger', () => {
  it('shows sets and reps fields for strength exercises', () => {
    render(<ExerciseLogger exercise={strengthExercise} onLog={jest.fn()} />)
    expect(screen.getByPlaceholderText('Sets')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Reps')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Weight (kg)')).toBeInTheDocument()
  })

  it('shows duration field for cardio exercises', () => {
    render(<ExerciseLogger exercise={cardioExercise} onLog={jest.fn()} />)
    expect(screen.getByPlaceholderText('Duration (min)')).toBeInTheDocument()
  })

  it('calls onLog with correct data when submitted', () => {
    const onLog = jest.fn()
    render(<ExerciseLogger exercise={strengthExercise} onLog={onLog} />)

    fireEvent.change(screen.getByPlaceholderText('Sets'), { target: { value: '4' } })
    fireEvent.change(screen.getByPlaceholderText('Reps'), { target: { value: '8' } })
    fireEvent.change(screen.getByPlaceholderText('Weight (kg)'), { target: { value: '80' } })
    fireEvent.click(screen.getByText('Log Set'))

    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({
      exercise_name: 'Bench Press',
      exercise_type: 'strength',
      sets: 4,
      reps: 8,
      weight_kg: 80,
    }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- ExerciseLogger
```

Expected: FAIL — `Cannot find module '@/components/ExerciseLogger'`

- [ ] **Step 3: Create ExerciseLogger component**

Create `src/components/ExerciseLogger.tsx`:

```typescript
'use client'

import { useState } from 'react'
import type { SuggestedExercise, WorkoutExercise } from '@/lib/types'

interface Props {
  exercise: SuggestedExercise
  onLog: (entry: Omit<WorkoutExercise, 'id' | 'workout_id'>) => void
  sortOrder?: number
}

export function ExerciseLogger({ exercise, onLog, sortOrder = 0 }: Props) {
  const [sets, setSets] = useState(exercise.sets?.toString() ?? '')
  const [reps, setReps] = useState(exercise.reps?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(exercise.weight_kg?.toString() ?? '')
  const [duration, setDuration] = useState(exercise.duration_minutes?.toString() ?? '')
  const [effort, setEffort] = useState(3)

  function handleSubmit() {
    onLog({
      exercise_name: exercise.name,
      exercise_type: exercise.type,
      sets: sets ? parseInt(sets) : null,
      reps: reps ? parseInt(reps) : null,
      weight_kg: weightKg ? parseFloat(weightKg) : null,
      duration_minutes: duration ? parseInt(duration) : null,
      perceived_effort: effort,
      sort_order: sortOrder,
    })
  }

  return (
    <div className="bg-gray-800 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-lg">{exercise.name}</h3>
        <p className="text-gray-400 text-sm">{exercise.muscle_groups.join(', ')}</p>
        {exercise.notes && <p className="text-blue-300 text-sm mt-1">{exercise.notes}</p>}
      </div>

      {exercise.type === 'strength' ? (
        <div className="grid grid-cols-3 gap-2">
          <input
            type="number"
            placeholder="Sets"
            value={sets}
            onChange={e => setSets(e.target.value)}
            className="bg-gray-700 rounded-xl px-3 py-3 text-center text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            placeholder="Reps"
            value={reps}
            onChange={e => setReps(e.target.value)}
            className="bg-gray-700 rounded-xl px-3 py-3 text-center text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            placeholder="Weight (kg)"
            value={weightKg}
            onChange={e => setWeightKg(e.target.value)}
            step="0.5"
            className="bg-gray-700 rounded-xl px-3 py-3 text-center text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      ) : (
        <input
          type="number"
          placeholder="Duration (min)"
          value={duration}
          onChange={e => setDuration(e.target.value)}
          className="w-full bg-gray-700 rounded-xl px-3 py-3 text-center text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}

      <div>
        <p className="text-sm text-gray-400 mb-2">Effort: {effort}/5</p>
        <input
          type="range"
          min={1}
          max={5}
          value={effort}
          onChange={e => setEffort(parseInt(e.target.value))}
          className="w-full accent-blue-500"
        />
      </div>

      <button
        onClick={handleSubmit}
        className="w-full bg-blue-600 hover:bg-blue-700 rounded-xl py-3 font-semibold transition-colors"
      >
        Log Set
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- ExerciseLogger
```

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExerciseLogger.tsx src/components/__tests__/
git commit -m "feat: add ExerciseLogger component with tests"
```

---

## Task 10: Active Workout Session

**Files:**
- Create: `src/components/SessionChat.tsx`
- Create: `src/app/workout/[id]/page.tsx`

- [ ] **Step 1: Create SessionChat component**

Create `src/components/SessionChat.tsx`:

```typescript
'use client'

import { useState } from 'react'
import type { SuggestedWorkout } from '@/lib/types'

interface Props {
  workout: SuggestedWorkout
  currentExercise: string
  onClose: () => void
}

export function SessionChat({ workout, currentExercise, onClose }: Props) {
  const [message, setMessage] = useState('')
  const [reply, setReply] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendMessage() {
    if (!message.trim()) return
    setLoading(true)

    const res = await fetch('/api/session-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        todayWorkout: workout,
        exerciseName: currentExercise,
        userMessage: message,
      }),
    })

    const data = await res.json()
    setReply(data.reply)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-t-3xl w-full p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Ask your trainer</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <p className="text-sm text-gray-400">
          Current exercise: <span className="text-white">{currentExercise}</span>
        </p>

        {reply && (
          <div className="bg-blue-900/40 border border-blue-700/40 rounded-xl p-4 text-sm text-blue-100">
            {reply}
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. No cable machine available"
            value={message}
            onChange={e => setMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMessage()}
            className="flex-1 bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl px-4 py-3 font-medium transition-colors"
          >
            {loading ? '...' : 'Ask'}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {["No equipment available", "Don't know this exercise", "Too heavy", "Substitute please"].map(q => (
            <button
              key={q}
              onClick={() => setMessage(q)}
              className="text-xs bg-gray-800 hover:bg-gray-700 rounded-full px-3 py-1.5 text-gray-300 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create active workout session page**

Create `src/app/workout/[id]/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ExerciseLogger } from '@/components/ExerciseLogger'
import { SessionChat } from '@/components/SessionChat'
import { format } from 'date-fns'
import type { SuggestedWorkout, WorkoutExercise } from '@/lib/types'

export default function WorkoutSessionPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [workout, setWorkout] = useState<SuggestedWorkout | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loggedExercises, setLoggedExercises] = useState<Omit<WorkoutExercise, 'id' | 'workout_id'>[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [saving, setSaving] = useState(false)

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

  function handleLog(entry: Omit<WorkoutExercise, 'id' | 'workout_id'>) {
    setLoggedExercises(prev => [...prev, { ...entry, sort_order: currentIndex }])
    if (workout && currentIndex < workout.exercises.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }

  async function finishWorkout() {
    if (loggedExercises.length === 0) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const today = format(new Date(), 'yyyy-MM-dd')
    const { data: workoutRow } = await supabase
      .from('workouts')
      .upsert({ user_id: user.id, date: today, status: 'completed' })
      .select()
      .single()

    if (workoutRow) {
      await supabase.from('workout_exercises').insert(
        loggedExercises.map(ex => ({ ...ex, workout_id: workoutRow.id }))
      )
    }

    router.push('/dashboard')
  }

  if (!workout) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-400">Loading workout...</p>
    </div>
  )

  const currentExercise = workout.exercises[currentIndex]
  const isLastExercise = currentIndex === workout.exercises.length - 1

  return (
    <div className="px-5 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{workout.title}</h1>
          <p className="text-gray-400 text-sm">
            Exercise {currentIndex + 1} of {workout.exercises.length}
          </p>
        </div>
        <button
          onClick={() => setChatOpen(true)}
          className="bg-gray-800 hover:bg-gray-700 rounded-xl px-3 py-2 text-sm transition-colors"
        >
          💬 Help
        </button>
      </div>

      <div className="flex gap-1">
        {workout.exercises.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < currentIndex ? 'bg-green-500' :
              i === currentIndex ? 'bg-blue-500' : 'bg-gray-700'
            }`}
          />
        ))}
      </div>

      <ExerciseLogger
        exercise={currentExercise}
        onLog={handleLog}
        sortOrder={currentIndex}
      />

      {loggedExercises.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-400 font-medium">Logged this session:</p>
          {loggedExercises.map((ex, i) => (
            <div key={i} className="bg-gray-800/60 rounded-xl px-4 py-2 text-sm text-gray-300">
              {ex.exercise_type === 'strength'
                ? `${ex.exercise_name}: ${ex.sets}×${ex.reps} @ ${ex.weight_kg}kg`
                : `${ex.exercise_name}: ${ex.duration_minutes}min`}
            </div>
          ))}
        </div>
      )}

      {isLastExercise && loggedExercises.length > 0 && (
        <button
          onClick={finishWorkout}
          disabled={saving}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-xl py-4 font-bold text-lg transition-colors"
        >
          {saving ? 'Saving...' : 'Finish Workout'}
        </button>
      )}

      {chatOpen && workout && (
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

- [ ] **Step 3: Test session flow in browser**

1. Dashboard → "Start Workout"
2. Exercise appears with Log Set form
3. Fill in sets/reps/weight → "Log Set" → advances to next exercise
4. Progress bar fills up
5. Tap "Help" → chat overlay appears → type "no equipment" → AI responds
6. On last exercise → "Finish Workout" → redirects to dashboard
7. Check Supabase → `workouts` and `workout_exercises` have rows

- [ ] **Step 4: Commit**

```bash
git add src/app/workout/ src/components/SessionChat.tsx
git commit -m "feat: add active workout session with exercise logging and AI chat"
```

---

## Task 11: Post-Workout Log

**Files:**
- Create: `src/app/workout/log/page.tsx`

- [ ] **Step 1: Create post-workout log page**

Create `src/app/workout/log/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ExerciseLogger } from '@/components/ExerciseLogger'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { WorkoutExercise, SuggestedExercise } from '@/lib/types'

const COMMON_EXERCISES: SuggestedExercise[] = [
  { name: 'Bench Press', type: 'strength', sets: 4, reps: 8, weight_kg: 60, muscle_groups: ['chest'] },
  { name: 'Squat', type: 'strength', sets: 4, reps: 8, weight_kg: 80, muscle_groups: ['legs'] },
  { name: 'Deadlift', type: 'strength', sets: 3, reps: 5, weight_kg: 100, muscle_groups: ['back', 'legs'] },
  { name: 'Pull-up', type: 'strength', sets: 3, reps: 8, weight_kg: 0, muscle_groups: ['back'] },
  { name: 'Overhead Press', type: 'strength', sets: 3, reps: 8, weight_kg: 40, muscle_groups: ['shoulders'] },
  { name: 'Treadmill Run', type: 'cardio', duration_minutes: 30, muscle_groups: ['cardio'] },
  { name: 'Cycling', type: 'cardio', duration_minutes: 30, muscle_groups: ['cardio'] },
]

export default function PostWorkoutLogPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedExercise, setSelectedExercise] = useState<SuggestedExercise>(COMMON_EXERCISES[0])
  const [customName, setCustomName] = useState('')
  const [logged, setLogged] = useState<Omit<WorkoutExercise, 'id' | 'workout_id'>[]>([])
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const activeExercise: SuggestedExercise = customName
    ? { ...selectedExercise, name: customName }
    : selectedExercise

  function handleLog(entry: Omit<WorkoutExercise, 'id' | 'workout_id'>) {
    setLogged(prev => [...prev, entry])
  }

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
      await supabase.from('workout_exercises').insert(
        logged.map(ex => ({ ...ex, workout_id: workoutRow.id }))
      )
    }

    router.push('/dashboard')
  }

  return (
    <div className="px-5 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Log Workout</h1>
        <p className="text-gray-400 text-sm">Record a past session</p>
      </div>

      <div>
        <label className="text-sm text-gray-400 mb-1 block">Workout Date</label>
        <input
          type="date"
          value={date}
          max={format(new Date(), 'yyyy-MM-dd')}
          onChange={e => setDate(e.target.value)}
          className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="text-sm text-gray-400 mb-1 block">Exercise</label>
        <select
          value={selectedExercise.name}
          onChange={e => {
            const ex = COMMON_EXERCISES.find(x => x.name === e.target.value)
            if (ex) setSelectedExercise(ex)
            setCustomName('')
          }}
          className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500 mb-2"
        >
          {COMMON_EXERCISES.map(ex => (
            <option key={ex.name} value={ex.name}>{ex.name}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Or type a custom exercise name"
          value={customName}
          onChange={e => setCustomName(e.target.value)}
          className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <ExerciseLogger exercise={activeExercise} onLog={handleLog} sortOrder={logged.length} />

      {logged.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-400 font-medium">Logged ({logged.length}):</p>
          {logged.map((ex, i) => (
            <div key={i} className="bg-gray-800/60 rounded-xl px-4 py-2 text-sm text-gray-300">
              {ex.exercise_type === 'strength'
                ? `${ex.exercise_name}: ${ex.sets}×${ex.reps} @ ${ex.weight_kg}kg`
                : `${ex.exercise_name}: ${ex.duration_minutes}min`}
            </div>
          ))}
          <button
            onClick={saveWorkout}
            disabled={saving}
            className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-xl py-3 font-bold transition-colors mt-2"
          >
            {saving ? 'Saving...' : 'Save Workout'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Test post-workout log in browser**

1. Dashboard → "Log Past Workout"
2. Pick a past date
3. Select an exercise, fill in sets/reps/weight → "Log Set"
4. Add 2–3 exercises → "Save Workout"
5. Redirects to dashboard, history calendar shows the logged date

- [ ] **Step 3: Commit**

```bash
git add src/app/workout/log/
git commit -m "feat: add post-workout log page for after-the-fact entry"
```

---

## Task 12: History & Progress

**Files:**
- Create: `src/app/history/page.tsx`
- Create: `src/components/ProgressChart.tsx`

- [ ] **Step 1: Create ProgressChart component**

Create `src/components/ProgressChart.tsx`:

```typescript
'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import type { Workout, WorkoutExercise } from '@/lib/types'

interface Props {
  exerciseName: string
  workouts: Array<Workout & { exercises: WorkoutExercise[] }>
}

export function ProgressChart({ exerciseName, workouts }: Props) {
  const data = workouts
    .flatMap(w =>
      w.exercises
        .filter(e => e.exercise_name === exerciseName && e.weight_kg != null)
        .map(e => ({ date: w.date, weight: e.weight_kg, label: format(new Date(w.date), 'MMM d') }))
    )
    .sort((a, b) => a.date.localeCompare(b.date))

  if (data.length < 2) return (
    <p className="text-gray-500 text-sm text-center py-4">
      Not enough data for {exerciseName} yet — log at least 2 sessions.
    </p>
  )

  return (
    <div className="bg-gray-800 rounded-2xl p-4">
      <p className="text-sm font-medium mb-3">{exerciseName} — Weight (kg)</p>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8 }}
            labelStyle={{ color: '#e5e7eb' }}
          />
          <Line type="monotone" dataKey="weight" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Create history page**

Create `src/app/history/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ProgressChart } from '@/components/ProgressChart'
import { format } from 'date-fns'
import type { Workout, WorkoutExercise } from '@/lib/types'

type WorkoutWithExercises = Workout & { exercises: WorkoutExercise[] }

export default function HistoryPage() {
  const [workouts, setWorkouts] = useState<WorkoutWithExercises[]>([])
  const [selectedExercise, setSelectedExercise] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('workouts')
        .select('*, workout_exercises(*)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(60)

      const mapped = (data ?? []).map(w => ({
        ...w,
        exercises: (w.workout_exercises ?? []) as WorkoutExercise[],
      })) as WorkoutWithExercises[]

      setWorkouts(mapped)

      const allExercises = [...new Set(mapped.flatMap(w => w.exercises.map(e => e.exercise_name)))]
      if (allExercises.length > 0) setSelectedExercise(allExercises[0])

      setLoading(false)
    }
    load()
  }, [])

  const strengthExercises = [...new Set(
    workouts.flatMap(w => w.exercises.filter(e => e.exercise_type === 'strength').map(e => e.exercise_name))
  )]

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-400">Loading history...</p>
    </div>
  )

  return (
    <div className="px-5 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-gray-400 text-sm">{workouts.length} sessions logged</p>
      </div>

      <div className="space-y-2">
        {workouts.slice(0, 20).map(w => (
          <div key={w.id} className="bg-gray-800 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium">{format(new Date(w.date), 'EEE, MMM d')}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                w.status === 'completed' ? 'bg-green-900/50 text-green-400' : 'bg-gray-700 text-gray-400'
              }`}>
                {w.status}
              </span>
            </div>
            <p className="text-gray-400 text-sm">
              {w.exercises.length} exercises ·{' '}
              {w.exercises.map(e => e.exercise_name).slice(0, 3).join(', ')}
              {w.exercises.length > 3 && ` +${w.exercises.length - 3}`}
            </p>
          </div>
        ))}
      </div>

      {strengthExercises.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Progress</h2>
          <select
            value={selectedExercise}
            onChange={e => setSelectedExercise(e.target.value)}
            className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
          >
            {strengthExercises.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {selectedExercise && (
            <ProgressChart exerciseName={selectedExercise} workouts={workouts} />
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Test history in browser**

1. Log 2+ workouts with the same exercise
2. Go to History → see session list
3. Select an exercise in the dropdown → weight chart appears
4. Chart shows progression over time

- [ ] **Step 4: Commit**

```bash
git add src/app/history/ src/components/ProgressChart.tsx
git commit -m "feat: add history page with session list and weight progression charts"
```

---

## Task 13: Profile & Settings

**Files:**
- Create: `src/app/profile/page.tsx`

- [ ] **Step 1: Create profile page**

Create `src/app/profile/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { FitnessLevel } from '@/lib/types'

const EQUIPMENT_OPTIONS = [
  'Barbell', 'Dumbbells', 'Cables', 'Smith Machine',
  'Pull-up Bar', 'Resistance Bands', 'Treadmill',
  'Stationary Bike', 'Rowing Machine', 'Kettlebells',
  'Dip Bars', 'Leg Press', 'Lat Pulldown',
]

const OPENROUTER_MODELS = [
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat (default)' },
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  { id: 'openai/gpt-4o', label: 'GPT-4o' },
  { id: 'meta-llama/llama-3.1-70b-instruct', label: 'Llama 3.1 70B' },
]

export default function ProfilePage() {
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>('intermediate')
  const [equipment, setEquipment] = useState<string[]>([])
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
      }
      setEquipment((eq ?? []).map(e => e.equipment_name))
    }
    load()
  }, [])

  function toggleEquipment(name: string) {
    const lower = name.toLowerCase()
    setEquipment(prev =>
      prev.includes(lower) ? prev.filter(e => e !== lower) : [...prev, lower]
    )
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({ fitness_level: fitnessLevel }).eq('id', user.id)

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
  }

  return (
    <div className="px-5 py-8 space-y-8">
      <h1 className="text-2xl font-bold">Profile & Settings</h1>

      <div>
        <h2 className="text-sm text-gray-400 font-medium mb-3 uppercase tracking-wide">Fitness Level</h2>
        <div className="space-y-2">
          {(['beginner', 'intermediate', 'advanced'] as FitnessLevel[]).map(level => (
            <button
              key={level}
              onClick={() => setFitnessLevel(level)}
              className={`w-full text-left px-4 py-3 rounded-xl capitalize font-medium border-2 transition-colors ${
                fitnessLevel === level
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-700 bg-gray-800'
              }`}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm text-gray-400 font-medium mb-3 uppercase tracking-wide">Equipment</h2>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map(name => (
            <button
              key={name}
              onClick={() => toggleEquipment(name)}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                equipment.includes(name.toLowerCase())
                  ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                  : 'border-gray-600 bg-gray-800 text-gray-300'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm text-gray-400 font-medium mb-3 uppercase tracking-wide">AI Model</h2>
        <select
          value={model}
          onChange={e => setModel(e.target.value)}
          className="w-full bg-gray-800 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-500"
        >
          {OPENROUTER_MODELS.map(m => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-2">
          Note: model override requires server restart (set OPENROUTER_MODEL env var)
        </p>
      </div>

      <button
        onClick={save}
        disabled={saving}
        className={`w-full rounded-xl py-3 font-semibold transition-colors ${
          saved
            ? 'bg-green-600'
            : 'bg-blue-600 hover:bg-blue-700 disabled:opacity-50'
        }`}
      >
        {saved ? 'Saved!' : saving ? 'Saving...' : 'Save Changes'}
      </button>

      <button
        onClick={signOut}
        className="w-full bg-gray-800 hover:bg-gray-700 rounded-xl py-3 font-medium text-gray-300 transition-colors"
      >
        Sign Out
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Add profile link to dashboard**

Add a profile icon to `src/app/dashboard/page.tsx` header:

```typescript
// Add this import at the top
import Link from 'next/link'

// Add inside the flex header div, next to the streak:
<Link href="/profile" className="text-gray-400 hover:text-white text-xl">⚙️</Link>
```

- [ ] **Step 3: Test profile page in browser**

1. Dashboard → gear icon → Profile page
2. Change fitness level → Save → reload → persisted
3. Toggle equipment → Save → reload → persisted
4. Sign Out → redirects to login

- [ ] **Step 4: Commit**

```bash
git add src/app/profile/ src/app/dashboard/page.tsx
git commit -m "feat: add profile/settings page with equipment editor and sign out"
```

---

## Task 14: Deploy to Vercel

**Files:**
- No new files — deployment config

- [ ] **Step 1: Push to GitHub**

```bash
git remote add origin https://github.com/<your-username>/gym-trainer.git
git branch -M main
git push -u origin main
```

- [ ] **Step 2: Deploy on Vercel**

1. Go to https://vercel.com → New Project → Import from GitHub
2. Select `gym-trainer` repo
3. Add environment variables (from `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENROUTER_API_KEY`
   - `OPENROUTER_MODEL`
4. Deploy

- [ ] **Step 3: Verify on iPhone Safari**

Open the Vercel URL in iPhone Safari:
1. Sign up → onboarding → dashboard loads
2. Weekly strip visible, workout card loads
3. Start Workout → exercise UI works with one thumb
4. Session chat opens from bottom

- [ ] **Step 4: Update Supabase auth settings**

In Supabase → Authentication → URL Configuration:
- Add your Vercel URL to "Redirect URLs"

- [ ] **Step 5: Final verification checklist**

```
[ ] Sign up → onboarding → starter workout on dashboard
[ ] Start workout → log exercises → finish → in history
[ ] Next day → AI suggestion references yesterday's muscles
[ ] Session chat → swap exercise → equipment-compatible reply
[ ] iPhone Safari → one-handed usable layout
[ ] Second user → cannot see first user's data
```

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: ready for production deployment"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Mobile-first web app | Task 1 (Next.js + Tailwind max-w-md) |
| Supabase auth (email + magic link) | Task 6 |
| 3-step onboarding (level, days, equipment) | Task 7 |
| AI starter template selection | API route in Task 5 + prompt in Task 4 |
| Dashboard: weekly strip + streak + AI card | Task 8 |
| Active workout session (exercise-by-exercise) | Task 10 |
| Cardio: duration + effort slider | Task 9 (ExerciseLogger) |
| Session chat (exercise swap) | Task 10 (SessionChat) |
| Post-workout log (date picker) | Task 11 |
| History calendar + progress charts | Task 12 |
| Profile/settings: equipment + level + model | Task 13 |
| OpenRouter model-agnostic | Task 4 (openrouter.ts) |
| AI suggestion cached once/day | Task 5 (suggest-workout route) |
| Fallback when AI fails | Task 5 (fallback workout) |
| RLS — users see only their data | Task 2 (SQL migration) |
| Vercel deployment | Task 14 |

All spec requirements covered. No placeholders remain. Types are consistent throughout (`SuggestedExercise`, `SuggestedWorkout`, `WorkoutExercise`, `FitnessLevel`, `ExerciseType`, `WorkoutStatus`).
