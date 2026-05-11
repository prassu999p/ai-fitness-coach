export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced'
export type ExerciseType = 'strength' | 'cardio'
export type WorkoutStatus = 'completed' | 'skipped'
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
