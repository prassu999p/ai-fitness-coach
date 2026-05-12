import type { PrescribedExercise, WeekPlan } from '@/lib/types'

const EXERCISE_ALIASES: Record<string, string> = {
  'BB Bench': 'Bench Press',
  'BB Row': 'Barbell Row',
  'OHP': 'Overhead Press',
  'DB Curl': 'Dumbbell Curl',
  'Pull Up': 'Pull-up',
  'Pullup': 'Pull-up',
  'Chin Up': 'Chin-up',
}

const MUSCLE_GROUP: Record<string, string> = {
  'Bench Press': 'chest', 'Incline Bench Press': 'chest', 'Dumbbell Flye': 'chest',
  'Pull-up': 'back', 'Chin-up': 'back', 'Barbell Row': 'back', 'Cable Row': 'back',
  'Overhead Press': 'shoulders', 'Lateral Raise': 'shoulders',
  'Squat': 'quads', 'Leg Press': 'quads', 'Lunge': 'quads',
  'Deadlift': 'hamstrings', 'Romanian Deadlift': 'hamstrings', 'Leg Curl': 'hamstrings',
}

type ProgramInput = {
  goal: string
  duration_weeks: number
  start_date: string
  phases: Array<{ name: string; week_range: [number, number]; focus: string; intensity: string }>
  week_plan: WeekPlan
}

export function validateProgram(program: ProgramInput): { valid: boolean; errors: string[]; normalized: ProgramInput } {
  const errors: string[] = []
  const normalized = JSON.parse(JSON.stringify(program)) as ProgramInput

  for (const week of Object.values(normalized.week_plan)) {
    for (const day of Object.values(week)) {
      if (!day.exercises) continue
      day.exercises = day.exercises.map((ex: PrescribedExercise) => ({
        ...ex,
        name: EXERCISE_ALIASES[ex.name] ?? ex.name,
      }))
    }
  }

  for (const [weekKey, week] of Object.entries(normalized.week_plan)) {
    const groupSets: Record<string, number> = {}
    for (const day of Object.values(week)) {
      for (const ex of (day.exercises ?? [])) {
        const group = MUSCLE_GROUP[ex.name] ?? 'other'
        groupSets[group] = (groupSets[group] ?? 0) + ex.sets
      }
    }
    for (const [group, total] of Object.entries(groupSets)) {
      if (total > 30) {
        errors.push(`Week ${weekKey}: ${group} has ${total} sets (max 30)`)
      }
    }
  }

  return { valid: errors.length === 0, errors, normalized }
}
