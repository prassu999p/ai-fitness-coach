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
