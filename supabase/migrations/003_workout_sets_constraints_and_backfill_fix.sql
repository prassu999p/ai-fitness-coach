-- Add CHECK constraints to prevent nonsensical values in workout_sets
alter table workout_sets
  add constraint chk_per_set_set_number_positive check (set_number > 0),
  add constraint chk_per_set_weight_nonnegative  check (weight_kg >= 0),
  add constraint chk_per_set_reps_nonnegative    check (reps >= 0);

-- Backfill fix: insert workout_set rows for strength exercises that have
-- reps or perceived_effort but no weight_kg (missed by the original migration).
insert into workout_sets (workout_exercise_id, set_number, weight_kg, reps, perceived_effort)
select we.id, 1, we.weight_kg, we.reps, we.perceived_effort
from workout_exercises we
left join workout_sets ws on ws.workout_exercise_id = we.id
where we.exercise_type = 'strength'
  and (we.weight_kg is not null or we.reps is not null or we.perceived_effort is not null)
  and ws.id is null;
