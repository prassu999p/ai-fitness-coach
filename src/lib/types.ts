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
