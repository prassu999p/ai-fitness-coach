import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callOpenRouter } from '@/lib/openrouter'
import { buildWorkoutPrompt } from '@/lib/prompts'
import { format } from 'date-fns'
import type { SuggestedWorkout, WorkoutExercise, Workout } from '@/lib/types'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const dayOfWeek = format(new Date(), 'EEEE')

  // Return cached suggestion if it exists for today
  const { data: cached } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  if (cached) {
    return NextResponse.json({ suggestion: cached.suggested_workout })
  }

  // Fetch profile and equipment
  const [{ data: profile }, { data: equipment }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('user_equipment').select('*').eq('user_id', user.id),
  ])

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Fetch last 7 days of workout history with exercises
  const sevenDaysAgo = format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  const { data: recentWorkouts } = await supabase
    .from('workouts')
    .select('*, workout_exercises(*)')
    .eq('user_id', user.id)
    .gte('date', sevenDaysAgo)
    .order('date', { ascending: false })

  const workoutsWithExercises = (recentWorkouts ?? []).map(w => ({
    ...w,
    exercises: (w.workout_exercises ?? []) as WorkoutExercise[],
  })) as Array<Workout & { exercises: WorkoutExercise[] }>

  const prompt = buildWorkoutPrompt(profile, equipment ?? [], workoutsWithExercises, dayOfWeek)
  const model = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'

  let suggestedWorkout: SuggestedWorkout

  try {
    const raw = await callOpenRouter([{ role: 'user', content: prompt }], model)
    const json = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    suggestedWorkout = JSON.parse(json)
  } catch {
    suggestedWorkout = {
      title: 'General Fitness',
      estimated_minutes: 45,
      muscle_groups: ['full body'],
      exercises: [
        { name: 'Bodyweight Squat', type: 'strength', sets: 3, reps: 12, weight_kg: 0, muscle_groups: ['legs'] },
        { name: 'Push-up', type: 'strength', sets: 3, reps: 10, weight_kg: 0, muscle_groups: ['chest', 'shoulders'] },
        { name: 'Walking', type: 'cardio', duration_minutes: 20, muscle_groups: ['cardio'] },
      ],
    }
  }

  await supabase.from('ai_suggestions').upsert({
    user_id: user.id,
    date: today,
    suggested_workout: suggestedWorkout,
    model_used: model,
  })

  return NextResponse.json({ suggestion: suggestedWorkout })
}
