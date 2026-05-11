import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callOpenRouter } from '@/lib/openrouter'
import { buildWorkoutPrompt, buildWeeklyPlanPrompt } from '@/lib/prompts'
import { format, startOfWeek } from 'date-fns'
import type {
  SuggestedWorkout,
  WorkoutExercise,
  Workout,
  WeeklyPlan,
  DayFocus,
  DayKey,
} from '@/lib/types'

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

function dayKeyFor(date: Date): DayKey {
  return DAY_KEYS[date.getDay()]
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const dayOfWeek = format(now, 'EEEE')
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  const [{ data: profile }, { data: equipment }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('user_equipment').select('*').eq('user_id', user.id),
  ])

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const fourteenDaysAgo = format(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd')
  const { data: recentWorkouts } = await supabase
    .from('workouts')
    .select('*, workout_exercises(*)')
    .eq('user_id', user.id)
    .gte('date', fourteenDaysAgo)
    .order('date', { ascending: false })

  const workoutsWithExercises = (recentWorkouts ?? []).map(w => ({
    ...w,
    exercises: (w.workout_exercises ?? []) as WorkoutExercise[],
  })) as Array<Workout & { exercises: WorkoutExercise[] }>

  const model = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'

  // 1. Ensure a weekly plan exists for this week.
  let weeklyPlan: WeeklyPlan | null = null
  const { data: existingPlan } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .single()

  if (existingPlan) {
    weeklyPlan = existingPlan as WeeklyPlan
  } else {
    const planPrompt = buildWeeklyPlanPrompt(profile, equipment ?? [], workoutsWithExercises, weekStart)
    let planJson: { split_type: WeeklyPlan['split_type']; day_slots: WeeklyPlan['day_slots'] }
    try {
      const raw = await callOpenRouter([{ role: 'user', content: planPrompt }], model)
      const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      planJson = JSON.parse(clean)
    } catch {
      planJson = {
        split_type: profile.preferred_split === 'auto' ? 'full_body' : profile.preferred_split,
        day_slots: {
          mon: 'full_body', tue: 'rest', wed: 'full_body',
          thu: 'rest', fri: 'full_body', sat: 'rest', sun: 'rest',
        },
      }
    }

    const { data: inserted } = await supabase
      .from('weekly_plans')
      .insert({
        user_id: user.id,
        week_start: weekStart,
        split_type: planJson.split_type,
        day_slots: planJson.day_slots,
        model_used: model,
      })
      .select()
      .single()

    weeklyPlan = inserted as WeeklyPlan
  }

  // 2. Resolve today's focus.
  const focus: DayFocus = weeklyPlan.day_slots[dayKeyFor(now)] ?? 'rest'

  if (focus === 'rest') {
    return NextResponse.json({
      rest: true,
      weeklyPlan,
      focus,
    })
  }

  // 3. Ensure today's per-day suggestion exists.
  const { data: cached } = await supabase
    .from('ai_suggestions')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  if (cached) {
    return NextResponse.json({
      suggestion: cached.suggested_workout,
      weeklyPlan,
      focus,
    })
  }

  const prompt = buildWorkoutPrompt(profile, equipment ?? [], workoutsWithExercises, dayOfWeek, focus)

  let suggestedWorkout: SuggestedWorkout
  try {
    const raw = await callOpenRouter([{ role: 'user', content: prompt }], model)
    const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    suggestedWorkout = JSON.parse(clean)
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

  return NextResponse.json({
    suggestion: suggestedWorkout,
    weeklyPlan,
    focus,
  })
}
