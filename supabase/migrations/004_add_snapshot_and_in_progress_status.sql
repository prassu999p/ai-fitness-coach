-- Add suggestion_snapshot to workouts
alter table workouts add column suggestion_snapshot jsonb;

-- Update status check constraint to allow 'in_progress'
alter table workouts drop constraint workouts_status_check;
alter table workouts add constraint workouts_status_check check (status in ('completed', 'skipped', 'in_progress'));
