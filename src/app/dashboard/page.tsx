'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WeeklyStrip } from '@/components/WeeklyStrip'
import { WorkoutCard } from '@/components/WorkoutCard'
import { BottomNav } from '@/components/BottomNav'
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Workout, SuggestedWorkout, WeeklyPlan, DayFocus, DayKey } from '@/lib/types'
import { CoachingCard } from '@/components/CoachingCard'
import type { TrainerMessage } from '@/lib/types'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const FOCUS_LABEL: Record<string, string> = {
  push: 'Push', pull: 'Pull', legs: 'Legs',
  upper: 'Upper Body', lower: 'Lower Body', full_body: 'Full Body',
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders',
  arms: 'Arms', core: 'Core', rest: 'Rest Day',
}

const FOCUS_COLOR: Record<string, string> = {
  push: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  pull: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  legs: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  upper: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  lower: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  full_body: 'bg-primary-container/20 text-primary-container border-primary-container/30',
  chest: 'bg-red-500/20 text-red-300 border-red-500/30',
  back: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  shoulders: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  arms: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  core: 'bg-teal-500/20 text-teal-300 border-teal-500/30',
  rest: 'bg-white/5 text-on-surface-variant/50 border-white/10',
}

export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [suggestion, setSuggestion] = useState<SuggestedWorkout | null>(null)
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlan | null>(null)
  const [focus, setFocus] = useState<DayFocus | null>(null)
  const [isRestDay, setIsRestDay] = useState(false)
  const [todayWorkoutId, setTodayWorkoutId] = useState<string | null>(null)
  const [todayHasLoggedExercises, setTodayHasLoggedExercises] = useState(false)
  const [streak, setStreak] = useState(0)
  const [equipmentCount, setEquipmentCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [planExpanded, setPlanExpanded] = useState(false)
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
    setFocus(body.focus ?? null)
    setIsPrescribed(body.isProgramBased ?? false)
    if (body.rest) {
      setIsRestDay(true)
      setSuggestion(null)
    } else {
      setIsRestDay(false)
      setSuggestion(body.suggestion ?? null)
    }
  }

  async function regeneratePlan() {
    setRegenerating(true)
    await fetch('/api/regenerate-weekly-plan', { method: 'POST' })
    await loadSuggestion()
    setRegenerating(false)
  }

  async function dismissCard(id: string) {
    setCoachingCards(prev => prev.filter(c => c.id !== id))
    await supabase
      .from('trainer_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
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

  // Build week day data for the expanded plan view
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 })
  const today = format(new Date(), 'yyyy-MM-dd')
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i)
    const dateStr = format(date, 'yyyy-MM-dd')
    const dayKey = DAY_KEYS[i]
    const focusValue = weeklyPlan?.day_slots?.[dayKey]
    const workout = workouts.find(w => w.date === dateStr)
    return { dateStr, dayKey, focusValue, workout, isToday: dateStr === today, isFuture: dateStr > today }
  })

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

        {/* Week plan card — expanded */}
        {weeklyPlan && (
          <section aria-label="Weekly Plan" className="bg-surface-container border border-white/[0.06] rounded-2xl overflow-hidden">
            {/* Header row */}
            <button
              id="weekly-plan-toggle"
              onClick={() => setPlanExpanded(prev => !prev)}
              className="w-full flex items-center justify-between px-md py-sm hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-xs">
                <span className="material-symbols-outlined text-[18px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>calendar_month</span>
                <p className="font-label-caps text-label-caps text-on-surface-variant/70 tracking-widest uppercase">
                  This Week — {weeklyPlan.split_type.replace(/_/g, ' ').toUpperCase()}
                </p>
              </div>
              <div className="flex items-center gap-sm">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant/50 transition-transform duration-200" style={{ transform: planExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  expand_more
                </span>
              </div>
            </button>

            {/* Expanded day-by-day grid */}
            {planExpanded && (
              <div className="border-t border-white/[0.06] divide-y divide-white/[0.04]">
                {weekDays.map(({ dateStr, dayKey, focusValue, workout, isToday, isFuture }) => {
                  const label = focusValue ? (FOCUS_LABEL[focusValue] ?? focusValue) : '—'
                  const colorClass = focusValue ? (FOCUS_COLOR[focusValue] ?? FOCUS_COLOR.rest) : FOCUS_COLOR.rest
                  const isRest = focusValue === 'rest'

                  return (
                    <div
                      key={dayKey}
                      className={`flex items-center justify-between px-md py-sm transition-colors ${isToday ? 'bg-primary-container/5' : ''}`}
                    >
                      <div className="flex items-center gap-sm min-w-0">
                        {/* Day + date */}
                        <div className="w-[52px] flex-shrink-0">
                          <p className={`font-label-caps text-[11px] tracking-wider font-bold ${isToday ? 'text-primary-container' : isFuture ? 'text-on-surface-variant/50' : 'text-on-surface-variant'}`}>
                            {DAY_SHORT[DAY_KEYS.indexOf(dayKey)]}
                          </p>
                          <p className={`font-mono text-[10px] ${isToday ? 'text-primary-container/70' : 'text-on-surface-variant/30'}`}>
                            {format(new Date(dateStr + 'T12:00:00'), 'MMM d')}
                          </p>
                        </div>

                        {/* Focus badge */}
                        <span className={`inline-flex items-center px-xs py-[3px] rounded-full border text-[10px] font-mono tracking-wider font-semibold ${colorClass}`}>
                          {label}
                        </span>

                        {isToday && (
                          <span className="inline-flex items-center px-xs py-[2px] rounded-full bg-primary-container/10 border border-primary-container/20 text-primary-container text-[9px] font-mono tracking-wider font-bold">
                            TODAY
                          </span>
                        )}
                      </div>

                      {/* Status icon */}
                      <div className="flex items-center gap-xs flex-shrink-0">
                        {workout?.status === 'completed' ? (
                          <span className="material-symbols-outlined text-[18px] text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        ) : isRest ? (
                          <span className="material-symbols-outlined text-[18px] text-on-surface-variant/30">bed</span>
                        ) : isFuture ? (
                          <span className="material-symbols-outlined text-[18px] text-on-surface-variant/20">radio_button_unchecked</span>
                        ) : (
                          <span className="material-symbols-outlined text-[18px] text-on-surface-variant/30">remove_circle_outline</span>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Regenerate row */}
                <div className="px-md py-sm flex items-center justify-between border-t border-white/[0.06]">
                  <p className="font-body-md text-[12px] text-on-surface-variant/50">Not happy with this plan?</p>
                  <button
                    id="regenerate-plan-btn"
                    onClick={regeneratePlan}
                    disabled={regenerating}
                    className="font-label-caps text-[11px] text-primary-container hover:brightness-110 tracking-wider uppercase disabled:opacity-40 flex items-center gap-[4px] transition-all"
                  >
                    <span className={`material-symbols-outlined text-[14px] ${regenerating ? 'animate-spin' : ''}`}>refresh</span>
                    {regenerating ? 'Regenerating…' : 'Regenerate'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

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
                    const supabaseClient = createClient()
                    const { data: { user } } = await supabaseClient.auth.getUser()
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

                    const { data } = await supabaseClient.from('workouts').insert({
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

        {/* Suppress unused warning for `focus` */}
        {focus && <span className="sr-only">Focus: {focus}</span>}
      </main>

      <BottomNav />
    </div>
  )
}
