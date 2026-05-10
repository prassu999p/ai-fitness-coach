import type { Profile, Equipment, Workout, WorkoutExercise, SuggestedWorkout } from '@/lib/types'

export function buildWorkoutPrompt(
  profile: Profile,
  equipment: Equipment[],
  recentWorkouts: Array<Workout & { exercises: WorkoutExercise[] }>,
  dayOfWeek: string
): string {
  const equipmentList = equipment.map(e => e.equipment_name).join(', ') || 'bodyweight only'

  const historySection = recentWorkouts.length === 0
    ? 'No workout history — this is a new user. Start conservatively.'
    : recentWorkouts.map(w => {
        const exList = w.exercises.map(e =>
          e.exercise_type === 'strength'
            ? `${e.exercise_name}: ${e.sets}x${e.reps} @ ${e.weight_kg}kg (effort ${e.perceived_effort}/5)`
            : `${e.exercise_name}: ${e.duration_minutes}min (effort ${e.perceived_effort}/5)`
        ).join('\n  ')
        return `${w.date} (${w.status}):\n  ${exList}`
      }).join('\n\n')

  return `You are a personal gym trainer AI. Generate a workout for today (${dayOfWeek}).

USER PROFILE:
- Fitness level: ${profile.fitness_level}
- Training days per week: ${profile.days_per_week}
- Available equipment: ${equipmentList}

RECENT WORKOUT HISTORY (last 7 days):
${historySection}

INSTRUCTIONS:
- Only suggest exercises using the available equipment listed above
- Avoid muscle groups trained in the last 24–48 hours
- Apply progressive overload based on history (slightly more weight/reps than previous sessions)
- Mix strength and cardio appropriate to the user's schedule
- Return ONLY a valid JSON object matching this exact schema:

{
  "title": "string",
  "estimated_minutes": number,
  "muscle_groups": ["string"],
  "exercises": [
    {
      "name": "string",
      "type": "strength" | "cardio",
      "sets": number,
      "reps": number,
      "weight_kg": number,
      "duration_minutes": number,
      "muscle_groups": ["string"],
      "notes": "string"
    }
  ]
}

For strength exercises omit duration_minutes. For cardio exercises omit sets, reps, weight_kg.`
}

export function buildSessionChatPrompt(
  todayWorkout: SuggestedWorkout,
  equipment: Equipment[],
  exerciseName: string,
  userMessage: string
): string {
  const equipmentList = equipment.map(e => e.equipment_name).join(', ') || 'bodyweight only'
  const workoutJson = JSON.stringify(todayWorkout, null, 2)

  return `You are an in-session gym trainer AI. The user needs help with an exercise substitution.

TODAY'S WORKOUT:
${workoutJson}

AVAILABLE EQUIPMENT: ${equipmentList}

EXERCISE IN QUESTION: ${exerciseName}

USER MESSAGE: ${userMessage}

Suggest a substitute exercise that:
1. Targets the same primary muscle group(s) as ${exerciseName}
2. Only uses equipment from the available equipment list
3. Is appropriate for the user's current workout context

Reply in 2–3 sentences: name the substitute, explain why it works, and give a brief cue for the first set.`
}
