'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WeeklyStrip } from '@/components/WeeklyStrip'
import { WorkoutCard } from '@/components/WorkoutCard'
import { BottomNav } from '@/components/BottomNav'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Workout, SuggestedWorkout, WeeklyPlan, TrainerMessage, TrainingProgram } from '@/lib/types'
import { CoachingCard } from '@/components/CoachingCard'
import { ProgramCard } from '@/components/ProgramCard'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}


export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [suggestion, setSuggestion] = useState<SuggestedWorkout | null>(null)
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null)
  const [isRestDay, setIsRestDay] = useState(false)
  const [todayWorkoutId, setTodayWorkoutId] = useState<string | null>(null)
  const [todayHasLoggedExercises, setTodayHasLoggedExercises] = useState(false)
  const [streak, setStreak] = useState(0)
  const [equipmentCount, setEquipmentCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [program, setProgram] = useState<TrainingProgram | null>(null)
  const [startingWorkout, setStartingWorkout] = useState(false)
  const [isPrescribed, setIsPrescribed] = useState(false)
  const [coachingCards, setCoachingCards] = useState<TrainerMessage[]>([])
  const [lastLoadDate, setLastLoadDate] = useState(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
  )
  const router = useRouter()
  const supabase = createClient()

  async function loadSuggestion(localDate?: string) {
    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const date = localDate ?? new Date().toLocaleDateString('en-CA', { timeZone: userTz })
    const res = await fetch('/api/suggest-workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ localDate: date }),
    })
    if (!res.ok) return
    const body = await res.json()
    setWeeklyPlan(body.weeklyPlan ?? null)
    setIsPrescribed(body.isProgramBased ?? false)
    if (body.rest) {
      setIsRestDay(true)
      setSuggestion(null)
    } else {
      setIsRestDay(false)
      setSuggestion(body.suggestion ?? null)
    }
  }

  async function dismissCard(id: string) {
    setCoachingCards(prev => prev.filter(c => c.id !== id))
    await supabase
      .from('trainer_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
    // silent fail is intentional — card stays dismissed locally; reappears on next load if write fails
  }

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single()
      if (!profile) {
        router.push('/onboarding')
        return
      }

      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

      const [{ data: weekWorkouts }, { data: equipmentRows }] = await Promise.all([
        supabase.from('workouts').select('*').eq('user_id', user.id).gte('date', weekStart).lte('date', weekEnd),
        supabase.from('user_equipment').select('id').eq('user_id', user.id),
      ])

      setWorkouts(weekWorkouts ?? [])
      setEquipmentCount(equipmentRows?.length ?? 0)

      const today = format(new Date(), 'yyyy-MM-dd')
      const todayWorkout = (weekWorkouts ?? []).find(w => w.date === today && w.status === 'in_progress')
      const todayId = todayWorkout?.id ?? null
      setTodayWorkoutId(todayId)

      // Check if today's workout already has logged exercises (for Continue vs Start)
      if (todayId) {
        const { count } = await supabase
          .from('workout_exercises')
          .select('id', { count: 'exact', head: true })
          .eq('workout_id', todayId)
        setTodayHasLoggedExercises((count ?? 0) > 0)
      } else {
        setTodayHasLoggedExercises(false)
      }

      const { data: allWorkouts } = await supabase
        .from('workouts')
        .select('date, status')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('date', { ascending: false })

      let s = 0
      const check = new Date()
      for (const w of allWorkouts ?? []) {
        if (w.date === format(check, 'yyyy-MM-dd')) {
          s++
          check.setDate(check.getDate() - 1)
        } else break
      }
      setStreak(s)

      try { await loadSuggestion() } catch {}

      const { data: cards } = await supabase
        .from('trainer_messages')
        .select('*')
        .eq('user_id', user.id)
        .in('message_type', ['check_in', 'weekly_review', 'program_adjustment'])
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(3)
      setCoachingCards(cards ?? [])

      const { data: activeProgram } = await supabase
        .from('training_programs')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setProgram(activeProgram ?? null)

      if (activeProgram) {
        const { data: activeWeek } = await supabase
          .from('program_weeks')
          .select('id, week_number, reviewed_at, status, week_start')
          .eq('program_id', activeProgram.id)
          .eq('status', 'active')
          .is('reviewed_at', null)
          .maybeSingle()

        if (activeWeek) {
          const weekStartDate = new Date(activeWeek.week_start + 'T00:00:00')
          const weekEndDate = new Date(weekStartDate)
          weekEndDate.setDate(weekEndDate.getDate() + 7)
          if (new Date() >= weekEndDate) {
            fetch('/api/trainer/review-week', { method: 'POST' }).catch(() => {})
          }
        }
      }

      setLoading(false)
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const today = new Date().toLocaleDateString('en-CA', { timeZone: userTz })
      if (today !== lastLoadDate) {
        setLastLoadDate(today)
        loadSuggestion(today)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  // loadSuggestion uses only setState dispatchers and its localDate arg — no stale closure risk
  }, [lastLoadDate]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col min-h-screen">
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex justify-between items-center px-margin h-14">
          <h1 className="font-headline-lg text-[20px] text-primary-container uppercase tracking-wider font-bold">Elite Athlete</h1>
          <Link
            href="/profile"
            className="w-9 h-9 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center text-on-surface-variant hover:text-primary-container hover:border-primary-container/30 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">person</span>
          </Link>
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[88px] px-margin flex flex-col gap-md">
        <div className="pt-xs">
          <p className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase mb-[4px] tracking-widest">
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
          <h2 className="font-headline-lg text-[28px] text-on-surface uppercase leading-tight">{getGreeting()}</h2>
        </div>

        <WeeklyStrip workouts={workouts} weeklyPlan={weeklyPlan} />

        {program && <ProgramCard program={program} />}

        {streak > 0 && (
          <section aria-label="Current Streak">
            <div className="bg-surface-container border border-white/[0.06] rounded-2xl p-md flex items-center gap-md overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary-container/40 to-transparent" />
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary-container/10 border border-primary-container/20">
                <span className="material-symbols-outlined text-primary-container text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
              </div>
              <div className="flex-1">
                <p className="font-label-caps text-label-caps text-on-surface-variant/70 tracking-widest uppercase">Current Streak</p>
                <div className="flex items-baseline gap-xs">
                  <span className="font-mono text-[32px] font-bold text-primary-container leading-none">{streak}</span>
                  <span className="font-data-sm text-data-sm text-on-surface-variant">DAYS</span>
                </div>
              </div>
            </div>
          </section>
        )}

        {coachingCards.length > 0 && (
          <section aria-label="Coaching Messages" className="flex flex-col gap-xs">
            {coachingCards.map(card => (
              <CoachingCard key={card.id} message={card} onDismiss={dismissCard} />
            ))}
          </section>
        )}

        {/* Today's Workout / Rest-day card */}
        {isRestDay ? (
          <section className="bg-surface-container border border-white/[0.06] rounded-2xl p-md flex flex-col gap-xs">
            <span className="material-symbols-outlined text-primary-container text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>bed</span>
            <h3 className="font-headline-md text-[20px] text-on-surface uppercase">Rest Day</h3>
            <p className="font-body-md text-[14px] text-on-surface-variant">
              Your plan has today as a rest day. Recover, hydrate, sleep well. You can still log an ad-hoc workout from below if you train today.
            </p>
          </section>
        ) : (
          <WorkoutCard workout={suggestion} loading={loading} isPrescribed={isPrescribed} />
        )}

        <section aria-label="Workout Actions" className="flex flex-col gap-xs">
          {!isRestDay && (todayWorkoutId ? (
            <Link
              id="continue-workout-btn"
              href={`/workout/${todayWorkoutId}`}
              className="w-full relative overflow-hidden bg-primary-container text-on-primary-container font-label-caps text-[14px] py-4 rounded-xl hover:brightness-110 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-xs font-bold tracking-wider"
            >
              <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                {todayHasLoggedExercises ? 'play_circle' : 'play_arrow'}
              </span>
              {todayHasLoggedExercises ? 'CONTINUE WORKOUT' : 'START WORKOUT'}
            </Link>
          ) : (
            suggestion && (
              <button
                id="start-workout-btn"
                disabled={startingWorkout}
                onClick={async () => {
                  if (startingWorkout) return
                  setStartingWorkout(true)
                  try {
                    const { data: { user } } = await supabase.auth.getUser()
                    if (!user) return

                    const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone
                    const localDate = new Date().toLocaleDateString('en-CA', { timeZone: userTz })
                    const res = await fetch('/api/suggest-workout', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ localDate }),
                    })
                    if (!res.ok) return
                    const body = await res.json() as { suggestion?: SuggestedWorkout; rest?: boolean }
                    if (body.rest || !body.suggestion) return

                    const { data } = await supabase.from('workouts').insert({
                      user_id: user.id,
                      date: localDate,
                      status: 'in_progress',
                      suggestion_snapshot: body.suggestion,
                    }).select().single()

                    if (data) {
                      setTodayWorkoutId(data.id)
                      router.push(`/workout/${data.id}`)
                    }
                  } finally {
                    setStartingWorkout(false)
                  }
                }}
                className="w-full relative overflow-hidden bg-primary-container text-on-primary-container font-label-caps text-[14px] py-4 rounded-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-60 transition-all duration-200 flex items-center justify-center gap-xs font-bold tracking-wider"
              >
                <span className="material-symbols-outlined text-[22px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                START WORKOUT
              </button>
            )
          ))}

          <Link
            id="log-past-workout-btn"
            href="/workout/log"
            className="w-full bg-surface-container border border-white/[0.08] text-on-surface-variant font-label-caps text-[13px] py-3.5 rounded-xl hover:bg-surface-container-high hover:border-white/[0.12] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-xs tracking-wider"
          >
            <span className="material-symbols-outlined text-[18px] opacity-60">history</span>
            LOG PAST WORKOUT
          </Link>

          {/* Equipment manage chip */}
          <Link
            href="/profile#equipment"
            className="w-full bg-surface-container-low border border-white/[0.06] text-on-surface-variant font-label-caps text-[11px] py-2.5 rounded-xl hover:bg-surface-container hover:border-white/[0.10] transition-all flex items-center justify-center gap-xs tracking-wider"
          >
            <span className="material-symbols-outlined text-[16px] opacity-60">fitness_center</span>
            EQUIPMENT: {equipmentCount} ITEMS · MANAGE
          </Link>
        </section>

      </main>

      <BottomNav />
    </div>
  )
}
