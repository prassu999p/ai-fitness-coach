import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callOpenRouter } from '@/lib/openrouter'
import { buildWorkoutPrompt, buildWeeklyPlanPrompt } from '@/lib/prompts'
import { format, startOfWeek, differenceInDays, parseISO } from 'date-fns'
import { calculateProgressiveOverload } from '@/lib/progressiveOverload'
import type {
  SuggestedWorkout,
  WorkoutExercise,
  Workout,
  WeeklyPlan,
  DayFocus,
  DayKey,
  TrainingProgram,
} from '@/lib/types'

const DAY_KEYS: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function dayKeyFor(date: Date): DayKey {
  return DAY_KEYS[date.getDay()]
}

function currentWeekNumber(program: TrainingProgram, today: Date): number {
  const start = parseISO(program.start_date)
  const daysSinceStart = differenceInDays(today, start)
  return Math.max(1, Math.min(Math.ceil((daysSinceStart + 1) / 7), program.duration_weeks))
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { localDate?: string }
  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const localDate = (typeof body.localDate === 'string' && LOCAL_DATE_RE.test(body.localDate))
    ? body.localDate
    : new Date().toLocaleDateString('en-CA', { timeZone: userTz })

  const now = new Date()
  const dayOfWeek = format(now, 'EEEE')
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const todayDayKey = dayKeyFor(now)

  const [{ data: profile }, { data: equipment }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('user_equipment').select('*').eq('user_id', user.id),
  ])

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Check for active training program
  const { data: program } = await supabase
    .from('training_programs')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (program) {
    // Program-based path
    const weekNum = currentWeekNumber(program as TrainingProgram, now)
    const weekSlots = (program.week_plan as Record<string, Record<string, { focus: string; exercises?: Array<{ name: string; sets: number; reps: number; weight_kg?: number }> }>>)[String(weekNum)]

    const todaySlot = weekSlots?.[todayDayKey]
    const focus = (todaySlot?.focus ?? 'rest') as DayFocus

    if (focus === 'rest' || !todaySlot) {
      return NextResponse.json({ rest: true, isProgramBased: true })
    }

    // Check cache using localDate
    const { data: cached } = await supabase
      .from('ai_suggestions')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', localDate)
      .maybeSingle()

    if (cached) {
      return NextResponse.json({ suggestion: cached.suggested_workout, isProgramBased: true })
    }

    // Build suggestion from prescribed exercises + progressive overload
    const exercises = todaySlot.exercises ?? []

    const resolvedExercises = await Promise.all(
      exercises.map(async ex => {
        if (!ex.sets || !ex.reps) {
          return {
            name: ex.name,
            type: 'strength' as const,
            sets: ex.sets,
            reps: ex.reps,
            weight_kg: ex.weight_kg ?? 0,
            muscle_groups: [],
          }
        }

        const { data: historyRows } = await supabase
          .from('workout_exercises')
          .select('weight_kg, reps, created_at')
          .eq('exercise_name', ex.name)
          .order('created_at', { ascending: false })
          .limit(6)

        const history = (historyRows ?? []).map((r: { weight_kg: number | null; reps: number | null; created_at: string }) => ({
          weight_kg: r.weight_kg,
          reps: r.reps,
          date: new Date(r.created_at).toLocaleDateString('en-CA'),
        }))

        const overload = calculateProgressiveOverload({
          exerciseName: ex.name,
          targetSets: ex.sets,
          targetReps: ex.reps,
          history,
          prescribedWeight: ex.weight_kg,
        })

        return {
          name: ex.name,
          type: 'strength' as const,
          sets: ex.sets,
          reps: ex.reps,
          weight_kg: overload.recommended_weight_kg,
          muscle_groups: [],
          notes: overload.basis,
        }
      })
    )

    const suggestedWorkout: SuggestedWorkout = {
      title: `${focus.charAt(0).toUpperCase() + focus.slice(1)} Day — Week ${weekNum}`,
      estimated_minutes: resolvedExercises.length * 8 + 10,
      muscle_groups: [],
      exercises: resolvedExercises,
    }

    await supabase.from('ai_suggestions').upsert({
      user_id: user.id,
      date: localDate,
      suggested_workout: suggestedWorkout,
      model_used: 'program',
    }, { onConflict: 'user_id,date' })

    return NextResponse.json({ suggestion: suggestedWorkout, isProgramBased: true })
  }

  // Fallback: existing LLM-based ad-hoc path (no active program)
  const model = process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat'

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

  let weeklyPlan: WeeklyPlan | null = null
  const { data: existingPlan } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('user_id', user.id)
    .eq('week_start', weekStart)
    .maybeSingle()

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
        day_slots: { mon: 'full_body', tue: 'rest', wed: 'full_body', thu: 'rest', fri: 'full_body', sat: 'rest', sun: 'rest' },
      }
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('weekly_plans')
      .upsert({ user_id: user.id, week_start: weekStart, split_type: planJson.split_type, day_slots: planJson.day_slots, model_used: model }, { onConflict: 'user_id,week_start', ignoreDuplicates: true })
      .select()
      .maybeSingle()

    if (insertErr || !inserted) {
      const { data: reFetched } = await supabase.from('weekly_plans').select('*').eq('user_id', user.id).eq('week_start', weekStart).maybeSingle()
      weeklyPlan = (reFetched as WeeklyPlan) ?? null
    } else {
      weeklyPlan = inserted as WeeklyPlan
    }
  }

  if (!weeklyPlan) return NextResponse.json({ error: 'Could not load weekly plan' }, { status: 503 })
  const focus: DayFocus = weeklyPlan.day_slots[dayKeyFor(now)] ?? 'rest'
  if (focus === 'rest') return NextResponse.json({ rest: true, weeklyPlan, focus })

  // Check cache using localDate
  const { data: cached } = await supabase.from('ai_suggestions').select('*').eq('user_id', user.id).eq('date', localDate).maybeSingle()
  if (cached) return NextResponse.json({ suggestion: cached.suggested_workout, weeklyPlan, focus })

  const prompt = buildWorkoutPrompt(profile, equipment ?? [], workoutsWithExercises, dayOfWeek, focus)
  let suggestedWorkout: SuggestedWorkout
  try {
    const raw = await callOpenRouter([{ role: 'user', content: prompt }], model)
    const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    suggestedWorkout = JSON.parse(clean)
  } catch {
    suggestedWorkout = {
      title: 'General Fitness', estimated_minutes: 45, muscle_groups: ['full body'],
      exercises: [
        { name: 'Bodyweight Squat', type: 'strength', sets: 3, reps: 12, weight_kg: 0, muscle_groups: ['legs'] },
        { name: 'Push-up', type: 'strength', sets: 3, reps: 10, weight_kg: 0, muscle_groups: ['chest', 'shoulders'] },
        { name: 'Walking', type: 'cardio', duration_minutes: 20, muscle_groups: ['cardio'] },
      ],
    }
  }

  await supabase.from('ai_suggestions').upsert({ user_id: user.id, date: localDate, suggested_workout: suggestedWorkout, model_used: model })
  return NextResponse.json({ suggestion: suggestedWorkout, weeklyPlan, focus })
}
