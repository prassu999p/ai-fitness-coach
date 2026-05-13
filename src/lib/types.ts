export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'
export type ExerciseType = 'strength' | 'cardio'
export type WorkoutStatus = 'completed' | 'skipped' | 'in_progress'
export type SplitType = 'auto' | 'full_body' | 'upper_lower' | 'ppl' | 'body_part'
export type DayKey   = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type DayFocus =
  | 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'full_body'
  | 'chest' | 'back' | 'shoulders' | 'arms' | 'core' | 'rest'

export interface Profile {
  id: string
  fitness_level: FitnessLevel
  days_per_week: number
  preferred_split: SplitType
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
  suggestion_snapshot: SuggestedWorkout | null
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

export interface WorkoutSet {
  id: string
  workout_exercise_id: string
  set_number: number
  weight_kg: number | null
  reps: number | null
  perceived_effort: number | null
}

export interface WorkoutSetInput {
  set_number: number
  weight_kg: number | null
  reps: number | null
  perceived_effort: number | null
}

export interface WeeklyPlan {
  id: string
  user_id: string
  week_start: string
  split_type: SplitType
  day_slots: Record<DayKey, DayFocus>
  model_used: string
}

export type PrimaryGoal = 'hypertrophy' | 'strength' | 'fat_loss' | 'endurance' | 'general_fitness'

export interface TrainingProgram {
  id: string
  user_id: string
  goal: PrimaryGoal
  duration_weeks: number
  start_date: string
  end_date: string
  status: 'active' | 'completed' | 'paused'
  phases: ProgramPhase[]
  week_plan: WeekPlan
  model_used: string | null
  created_at: string
}

export interface ProgramPhase {
  name: string
  week_range: [number, number]
  focus: string
  intensity: string
}

export type WeekPlan = Record<string, Record<string, DaySlot>>

export interface DaySlot {
  focus: string
  exercises?: PrescribedExercise[]
}

export interface PrescribedExercise {
  name: string
  sets: number
  reps: number
  weight_kg?: number
}

export interface ProgramWeek {
  id: string
  program_id: string
  user_id: string
  week_number: number
  week_start: string
  prescribed: WeekPlan | null
  actual: Record<string, unknown> | null
  adjustment_notes: string | null
  status: 'upcoming' | 'active' | 'reviewing' | 'completed' | 'adjusted'
  reviewed_at: string | null
  updated_at: string
}

export interface TrainerMessage {
  id: string
  user_id: string
  role: 'trainer' | 'user'
  content: string
  message_type: 'chat' | 'check_in' | 'program_adjustment' | 'session_feedback' | 'weekly_review'
  metadata: Record<string, unknown> | null
  read_at: string | null
  created_at: string
}

export interface PlanPreview {
  phases: Array<{ name: string; week_range: [number, number]; focus: string; top_exercises: string[] }>
  duration_weeks: number
  sessions_per_week: number
  notes: string
}

// Returned by get_workout_history when days > 14 (context-efficient summary)
export interface PerformanceSummary {
  exercise_name: string
  estimated_1rm_trend_kg: number | null
  weekly_volume_trend: 'increasing' | 'stable' | 'decreasing'
  last_rpe: number | null
  sessions_count: number
}
