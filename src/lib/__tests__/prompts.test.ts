import { buildWorkoutPrompt, buildSessionChatPrompt, buildWeeklyPlanPrompt } from '@/lib/prompts'
import type { Profile, Equipment, Workout, WorkoutExercise, SuggestedWorkout } from '@/lib/types'

const profile: Profile = {
  id: 'user-1',
  fitness_level: 'intermediate',
  days_per_week: 4,
  preferred_split: 'auto',
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

describe('buildWeeklyPlanPrompt', () => {
  it('includes the preferred split when not auto', () => {
    const fixedProfile = { ...profile, preferred_split: 'ppl' as const }
    const prompt = buildWeeklyPlanPrompt(fixedProfile, equipment, [], '2026-05-11')
    expect(prompt).toContain('ppl')
    expect(prompt).toContain('honor')
  })

  it('asks the AI to choose when preferred split is auto', () => {
    const prompt = buildWeeklyPlanPrompt(profile, equipment, [], '2026-05-11')
    expect(prompt.toLowerCase()).toContain('choose')
  })

  it('includes days_per_week as a hard constraint', () => {
    const prompt = buildWeeklyPlanPrompt(profile, equipment, [], '2026-05-11')
    expect(prompt).toContain('4')
    expect(prompt.toLowerCase()).toMatch(/non-rest|training day/)
  })

  it('asks for JSON with day_slots and split_type', () => {
    const prompt = buildWeeklyPlanPrompt(profile, equipment, [], '2026-05-11')
    expect(prompt).toContain('day_slots')
    expect(prompt).toContain('split_type')
    expect(prompt).toContain('JSON')
  })
})
