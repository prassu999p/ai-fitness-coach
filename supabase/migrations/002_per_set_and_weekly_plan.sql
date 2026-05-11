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
