'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WeeklyStrip } from '@/components/WeeklyStrip'
import { WorkoutCard } from '@/components/WorkoutCard'
import { BottomNav } from '@/components/BottomNav'
import { format, startOfWeek, endOfWeek } from 'date-fns'
import Link from 'next/link'
import type { Workout, SuggestedWorkout } from '@/lib/types'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [suggestion, setSuggestion] = useState<SuggestedWorkout | null>(null)
  const [todayWorkoutId, setTodayWorkoutId] = useState<string | null>(null)
  const [streak, setStreak] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
      const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')

      const { data: weekWorkouts } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', weekStart)
        .lte('date', weekEnd)

      setWorkouts(weekWorkouts ?? [])

      const today = format(new Date(), 'yyyy-MM-dd')
      const todayWorkout = (weekWorkouts ?? []).find(w => w.date === today)
      setTodayWorkoutId(todayWorkout?.id ?? null)

      // Calculate streak
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

      // Fetch AI suggestion
      try {
        const res = await fetch('/api/suggest-workout', { method: 'POST' })
        if (res.ok) {
          const { suggestion } = await res.json()
          setSuggestion(suggestion)
        }
      } catch {}

      setLoading(false)
    }

    load()
  }, [])

  return (
    <div className="flex flex-col min-h-screen">
      {/* Fixed Header */}
      <header className="fixed top-0 w-full max-w-md z-50 bg-surface/60 backdrop-blur-xl border-b border-white/5 flex justify-between items-center px-margin h-16">
        <button className="text-primary hover:opacity-80 transition-opacity flex items-center justify-center p-2 -ml-2">
          <span className="material-symbols-outlined">menu</span>
        </button>
        <h1 className="font-headline-lg text-headline-lg text-primary uppercase tracking-wider">
          Elite Athlete
        </h1>
        <Link
          href="/profile"
          className="w-8 h-8 rounded-full border border-outline-variant flex items-center justify-center text-on-surface-variant hover:text-primary hover:border-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">person</span>
        </Link>
      </header>

      {/* Main Content */}
      <main className="flex-grow pt-[88px] pb-[104px] px-margin flex flex-col gap-lg">
        {/* Greeting */}
        <div>
          <p className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-xs">
            {format(new Date(), 'EEEE, MMMM d')}
          </p>
          <h2 className="font-headline-lg text-headline-lg text-primary uppercase">
            {getGreeting()}
          </h2>
        </div>

        {/* Weekly Strip */}
        <WeeklyStrip workouts={workouts} />

        {/* Streak Card */}
        {streak > 0 && (
          <section aria-label="Current Streak" className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-container/10 to-transparent rounded-2xl blur-xl opacity-50 group-hover:opacity-80 transition-opacity duration-500" />
            <div className="relative bg-surface-container border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary-container/30 to-transparent" />
              <h2 className="font-label-caps text-label-caps text-surface-tint tracking-widest mb-2 flex items-center gap-xs">
                <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
                CURRENT STREAK
              </h2>
              <div className="flex items-baseline gap-xs">
                <span className="font-display-lg text-display-lg text-primary drop-shadow-[0_0_20px_rgba(255,255,255,0.4)] tracking-tight">
                  {streak}
                </span>
                <span className="font-data-lg text-data-lg text-on-surface-variant">DAYS</span>
              </div>
            </div>
          </section>
        )}

        {/* Today's Workout Card */}
        <WorkoutCard workout={suggestion} loading={loading} workoutId={todayWorkoutId} />

        {/* Action Buttons */}
        <section aria-label="Workout Actions" className="flex flex-col gap-sm">
          {todayWorkoutId ? (
            <Link
              href={`/workout/${todayWorkoutId}`}
              className="w-full relative overflow-hidden bg-gradient-to-br from-primary-container to-surface-tint text-on-primary-container font-label-caps text-label-caps text-[14px] py-5 rounded-xl shadow-[0_0_25px_rgba(195,244,0,0.25)] hover:shadow-[0_0_35px_rgba(195,244,0,0.4)] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-xs group"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <span className="material-symbols-outlined text-[24px] relative z-10" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
              <span className="relative z-10 tracking-wider">START WORKOUT</span>
            </Link>
          ) : (
            suggestion && (
              <button
                onClick={async () => {
                  const supabaseClient = createClient()
                  const { data: { user } } = await supabaseClient.auth.getUser()
                  if (!user) return
                  const today = format(new Date(), 'yyyy-MM-dd')
                  const { data } = await supabaseClient.from('workouts').insert({ user_id: user.id, date: today, status: 'completed' }).select().single()
                  if (data) setTodayWorkoutId(data.id)
                }}
                className="w-full relative overflow-hidden bg-gradient-to-br from-primary-container to-surface-tint text-on-primary-container font-label-caps text-label-caps text-[14px] py-5 rounded-xl shadow-[0_0_25px_rgba(195,244,0,0.25)] hover:shadow-[0_0_35px_rgba(195,244,0,0.4)] active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-xs group"
              >
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
                <span className="material-symbols-outlined text-[24px] relative z-10" style={{ fontVariationSettings: "'FILL' 1" }}>play_arrow</span>
                <span className="relative z-10 tracking-wider">START WORKOUT</span>
              </button>
            )
          )}

          <Link
            href="/workout/log"
            className="w-full bg-surface-container border border-outline-variant text-primary font-label-caps text-label-caps text-[14px] py-4 rounded-xl hover:bg-surface-container-high hover:border-white/20 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-xs"
          >
            <span className="material-symbols-outlined text-[20px] opacity-70">history</span>
            LOG PAST WORKOUT
          </Link>
        </section>
      </main>

      <BottomNav />
    </div>
  )
}
