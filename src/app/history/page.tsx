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
      <header className="fixed top-0 w-full max-w-md z-50 bg-surface/60 backdrop-blur-xl border-b border-white/5 flex justify-between items-center px-margin h-16">
        <div className="w-8" />
        <h1 className="font-headline-lg text-headline-lg text-primary uppercase tracking-wider">History</h1>
        <div className="w-8" />
      </header>

      <main className="flex-grow pt-[88px] pb-[104px] px-margin flex flex-col gap-lg">
        {/* Page Header */}
        <div>
          <h2 className="font-display-lg text-display-lg text-primary uppercase">Your Journey</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-xs">
            {workouts.length} sessions logged
          </p>
        </div>

        {/* Session list */}
        {workouts.length === 0 ? (
          <div className="bg-surface-container-low rounded-xl border border-white/5 p-lg flex flex-col items-center justify-center text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-sm">fitness_center</span>
            <h3 className="font-headline-md text-headline-md text-primary uppercase mb-xs">No Sessions Yet</h3>
            <p className="font-body-md text-body-md text-on-surface-variant">Complete your first workout to see your history here.</p>
          </div>
        ) : (
          <section className="flex flex-col gap-xs">
            <h3 className="font-headline-lg text-headline-lg text-primary uppercase mb-xs">Recent Sessions</h3>
            {workouts.slice(0, 20).map(w => (
              <div key={w.id} className="bg-surface-container-low rounded-xl border border-white/5 px-sm py-xs" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between mb-base">
                  <p className="font-headline-md text-headline-md text-primary uppercase">
                    {format(new Date(w.date + 'T00:00:00'), 'EEE, MMM d')}
                  </p>
                  <span className={`font-label-caps text-label-caps px-xs py-base rounded-full border ${
                    w.status === 'completed'
                      ? 'text-primary-container border-primary-container/30 bg-primary-container/10'
                      : 'text-on-surface-variant border-outline-variant bg-surface-container-high'
                  }`}>
                    {w.status.toUpperCase()}
                  </span>
                </div>
                <p className="font-data-sm text-data-sm text-on-surface-variant">
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
            <h3 className="font-headline-lg text-headline-lg text-primary uppercase">Progress Insights</h3>

            <div className="flex flex-col gap-xs">
              <label className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
                Exercise
              </label>
              <select
                value={selectedExercise}
                onChange={e => setSelectedExercise(e.target.value)}
                className="w-full bg-surface-container-high text-on-surface rounded-lg px-sm py-xs border-b-2 border-outline-variant focus:border-primary-container outline-none font-body-md text-body-md"
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
