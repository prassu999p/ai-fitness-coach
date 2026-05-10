import { buildWorkoutPrompt, buildSessionChatPrompt } from '@/lib/prompts'
import type { Profile, Equipment, Workout, WorkoutExercise, SuggestedWorkout } from '@/lib/types'

const profile: Profile = {
  id: 'user-1',
  fitness_level: 'intermediate',
  days_per_week: 4,
  created_at: '2026-05-01T00:00:00Z',
}

const equipment: Equipment[] = [
  { id: 'e1', user_id: 'user-1', equipment_name: 'barbell' },
  { id: 'e2', user_id: 'user-1', equipment_name: 'dumbbells' },
]

const recentWorkouts: Array<Workout & { exercises: WorkoutExercise[] }> = []

describe('buildWorkoutPrompt', () => {
  it('includes fitness level in prompt', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday')
    expect(prompt).toContain('intermediate')
  })

  it('includes equipment names in prompt', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday')
    expect(prompt).toContain('barbell')
    expect(prompt).toContain('dumbbells')
  })

  it('requests JSON output', () => {
    const prompt = buildWorkoutPrompt(profile, equipment, recentWorkouts, 'Monday')
    expect(prompt).toContain('JSON')
  })
})

describe('buildSessionChatPrompt', () => {
  const todayWorkout: SuggestedWorkout = {
    title: 'Upper Body',
    estimated_minutes: 60,
    muscle_groups: ['chest', 'shoulders'],
    exercises: [
      { name: 'Bench Press', type: 'strength', sets: 4, reps: 8, weight_kg: 80, muscle_groups: ['chest'] },
    ],
  }

  it('includes exercise name in prompt', () => {
    const prompt = buildSessionChatPrompt(todayWorkout, equipment, 'Bench Press', 'no flat bench available')
    expect(prompt).toContain('Bench Press')
  })

  it('includes user message in prompt', () => {
    const prompt = buildSessionChatPrompt(todayWorkout, equipment, 'Bench Press', 'no flat bench available')
    expect(prompt).toContain('no flat bench available')
  })
})
