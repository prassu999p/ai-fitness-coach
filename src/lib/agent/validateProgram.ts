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
  'Bench Press': 'chest', 'Incline Bench Press': 'chest', 'Dumbbell Bench Press': 'chest', 'Dumbbell Flye': 'chest', 'Push-up': 'chest',
  'Pull-up': 'back', 'Chin-up': 'back', 'Barbell Row': 'back', 'Cable Row': 'back', 'Dumbbell Row': 'back', 'Lat Pulldown': 'back',
  'Overhead Press': 'shoulders', 'Lateral Raise': 'shoulders', 'Military Press': 'shoulders', 'Face Pull': 'shoulders',
  'Squat': 'quads', 'Leg Press': 'quads', 'Lunge': 'quads', 'Leg Extension': 'quads',
  'Deadlift': 'hamstrings', 'Romanian Deadlift': 'hamstrings', 'Leg Curl': 'hamstrings',
  'Dumbbell Curl': 'arms', 'Bicep Curl': 'arms', 'Hammer Curl': 'arms', 'Tricep Extension': 'arms', 'Skullcrusher': 'arms', 'Dips': 'arms',
  'Calf Raise': 'calves', 'Seated Calf Raise': 'calves',
  'Plank': 'core', 'Hanging Leg Raise': 'core', 'Crunch': 'core',
}

type ProgramInput = {
  goal: string
  duration_weeks: number
  start_date: string
  phases: Array<{ name: string; week_range: number[]; focus: string; intensity: string }>
  week_plan: WeekPlan
}

export function validateProgram(program: ProgramInput): { valid: boolean; errors: string[]; normalized: ProgramInput } {
  const errors: string[] = []
  const normalized = JSON.parse(JSON.stringify(program)) as ProgramInput

  if (!normalized.week_plan) {
    return { valid: false, errors: ['Program is missing week_plan'], normalized }
  }

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
        let group = MUSCLE_GROUP[ex.name]
        if (!group) {
          const lower = ex.name.toLowerCase()
          if (lower.includes('bench') || lower.includes('chest') || lower.includes('push-up') || lower.includes('flye')) group = 'chest'
          else if (lower.includes('row') || lower.includes('pull') || lower.includes('chin') || lower.includes('lat')) group = 'back'
          else if (lower.includes('press') || lower.includes('raise') || lower.includes('delt')) group = 'shoulders'
          else if (lower.includes('squat') || lower.includes('lunge') || lower.includes('leg ext')) group = 'quads'
          else if (lower.includes('deadlift') || lower.includes('curl') && lower.includes('leg')) group = 'hamstrings'
          else if (lower.includes('curl') || lower.includes('extension') || lower.includes('dip') || lower.includes('skull')) group = 'arms'
          else if (lower.includes('calf')) group = 'calves'
          else if (lower.includes('plank') || lower.includes('crunch') || lower.includes('leg raise')) group = 'core'
          else group = 'other'
        }
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
