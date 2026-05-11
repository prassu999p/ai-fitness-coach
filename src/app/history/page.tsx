'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ProgressChart } from '@/components/ProgressChart'
import { BottomNav } from '@/components/BottomNav'
import { format } from 'date-fns'
import type { Workout, WorkoutExercise } from '@/lib/types'

type WorkoutWithExercises = Workout & { exercises: WorkoutExercise[] }

export default function HistoryPage() {
  const [workouts, setWorkouts] = useState<WorkoutWithExercises[]>([])
  const [selectedExercise, setSelectedExercise] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('workouts')
        .select('*, workout_exercises(*)')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(60)

      const mapped = (data ?? []).map(w => ({
        ...w,
        exercises: (w.workout_exercises ?? []) as WorkoutExercise[],
      })) as WorkoutWithExercises[]

      setWorkouts(mapped)

      const allStrengthExercises = Array.from(new Set(
        mapped.flatMap(w => w.exercises.filter(e => e.exercise_type === 'strength').map(e => e.exercise_name))
      ))
      if (allStrengthExercises.length > 0) setSelectedExercise(allStrengthExercises[0])

      setLoading(false)
    }
    load()
  }, [])

  const strengthExercises = Array.from(new Set(
    workouts.flatMap(w => w.exercises.filter(e => e.exercise_type === 'strength').map(e => e.exercise_name))
  ))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-primary-container animate-pulse">monitoring</span>
          <p className="font-body-md text-body-md text-on-surface-variant mt-sm">Loading history...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex justify-center items-center px-margin h-14">
          <h1 className="font-headline-lg text-[20px] text-primary-container uppercase tracking-wider font-bold">History</h1>
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[88px] px-margin flex flex-col gap-lg">
        {/* Page Header */}
        <div className="pt-xs">
          <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Your Journey</h2>
          <p className="font-body-md text-body-md text-on-surface-variant mt-[4px]">
            {workouts.length} sessions logged
          </p>
        </div>

        {/* Session list */}
        {workouts.length === 0 ? (
          <div className="bg-surface-container rounded-2xl border border-white/[0.06] p-lg flex flex-col items-center justify-center text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-sm">fitness_center</span>
            <h3 className="font-headline-md text-headline-md text-on-surface uppercase mb-xs">No Sessions Yet</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">Complete your first workout to see your history here.</p>
          </div>
        ) : (
          <section className="flex flex-col gap-xs">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest mb-[4px]">Recent Sessions</h3>
            {workouts.slice(0, 20).map(w => (
              <div key={w.id} className="bg-surface-container rounded-xl border border-white/[0.06] px-sm py-sm">
                <div className="flex items-center justify-between mb-[6px]">
                  <p className="font-headline-md text-[18px] text-on-surface uppercase">
                    {format(new Date(w.date + 'T00:00:00'), 'EEE, MMM d')}
                  </p>
                  <span className={`font-label-caps text-[10px] px-xs py-[4px] rounded-full border ${
                    w.status === 'completed'
                      ? 'text-primary-container border-primary-container/30 bg-primary-container/10'
                      : 'text-on-surface-variant border-outline-variant bg-surface-container-high'
                  }`}>
                    {w.status.toUpperCase()}
                  </span>
                </div>
                <p className="font-data-sm text-data-sm text-on-surface-variant/70">
                  {w.exercises.length} EXERCISES
                  {w.exercises.length > 0 && ` · ${w.exercises.map(e => e.exercise_name).slice(0, 3).join(', ')}${w.exercises.length > 3 ? ` +${w.exercises.length - 3}` : ''}`}
                </p>
              </div>
            ))}
          </section>
        )}

        {/* Progress Charts */}
        {strengthExercises.length > 0 && (
          <section className="flex flex-col gap-md">
            <h3 className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">Progress Insights</h3>

            <div className="flex flex-col gap-xs">
              <label className="font-label-caps text-label-caps text-on-surface-variant/50 uppercase tracking-widest text-[10px]">
                Exercise
              </label>
              <select
                value={selectedExercise}
                onChange={e => setSelectedExercise(e.target.value)}
                className="w-full bg-surface-container-high text-on-surface rounded-xl px-sm py-xs border border-white/[0.08] focus:border-primary-container/50 outline-none font-body-md text-body-md transition-colors"
              >
                {strengthExercises.map(name => (
                  <option key={name} value={name} className="bg-surface-container-high">{name}</option>
                ))}
              </select>
            </div>

            {selectedExercise && (
              <ProgressChart exerciseName={selectedExercise} workouts={workouts} />
            )}
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
