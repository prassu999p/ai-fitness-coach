-- Migration 1: Add goal fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS primary_goal text
    CHECK (primary_goal IN ('hypertrophy','strength','fat_loss','endurance','general_fitness')),
  ADD COLUMN IF NOT EXISTS goal_duration_weeks int,
  ADD COLUMN IF NOT EXISTS goal_set_at timestamptz;

-- Migration 2: training_programs
CREATE TABLE IF NOT EXISTS training_programs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal           text NOT NULL,
  duration_weeks int NOT NULL,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  status         text NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','completed','paused')),
  phases         jsonb NOT NULL,
  week_plan      jsonb NOT NULL,
  model_used     text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE training_programs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'training_programs' AND policyname = 'users own programs') THEN
    CREATE POLICY "users own programs" ON training_programs FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Migration 3: program_weeks — NOTE: 'reviewing' added to status, updated_at added
CREATE TABLE IF NOT EXISTS program_weeks (
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
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, week_number)
);
ALTER TABLE program_weeks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'program_weeks' AND policyname = 'users own program weeks') THEN
    CREATE POLICY "users own program weeks" ON program_weeks FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Migration 4: trainer_messages
CREATE TABLE IF NOT EXISTS trainer_messages (
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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'trainer_messages' AND policyname = 'users own messages') THEN
    CREATE POLICY "users own messages" ON trainer_messages FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;
