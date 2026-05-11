'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ExerciseLogger, type CompletedExercise } from '@/components/ExerciseLogger'
import { SessionChat } from '@/components/SessionChat'
import { format } from 'date-fns'
import type { SuggestedWorkout } from '@/lib/types'

export default function WorkoutSessionPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [workout, setWorkout] = useState<SuggestedWorkout | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [logged, setLogged] = useState<CompletedExercise[]>([])
  const [chatOpen, setChatOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [startTime] = useState(new Date())

  useEffect(() => {
    async function loadSuggestion() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data } = await supabase
        .from('ai_suggestions')
        .select('suggested_workout')
        .eq('user_id', user.id)
        .eq('date', today)
        .single()
      if (data) setWorkout(data.suggested_workout as SuggestedWorkout)
    }
    loadSuggestion()
  }, [])

  function handleComplete(entry: CompletedExercise) {
    setLogged(prev => [...prev, { ...entry, exercise: { ...entry.exercise, sort_order: currentIndex } }])
    if (workout && currentIndex < workout.exercises.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }

  async function finishWorkout() {
    if (logged.length === 0 || !params.id) return
    setSaving(true)

    await supabase
      .from('workouts')
      .update({
        status: 'completed',
        duration_minutes: Math.round((Date.now() - startTime.getTime()) / 60000),
      })
      .eq('id', params.id as string)

    // Insert workout_exercises and capture their IDs so we can insert workout_sets.
    const { data: insertedExercises } = await supabase
      .from('workout_exercises')
      .insert(logged.map(l => ({ ...l.exercise, workout_id: params.id as string })))
      .select()

    if (insertedExercises) {
      const setRows = insertedExercises.flatMap((ex, i) =>
        logged[i].sets.map(s => ({
          workout_exercise_id: ex.id,
          set_number: s.set_number,
          weight_kg: s.weight_kg,
          reps: s.reps,
          perceived_effort: s.perceived_effort,
        })),
      )
      if (setRows.length > 0) {
        await supabase.from('workout_sets').insert(setRows)
      }
    }

    router.push('/dashboard')
  }

  if (!workout) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-primary-container animate-pulse">fitness_center</span>
          <p className="font-body-md text-body-md text-on-surface-variant mt-sm">Loading workout...</p>
        </div>
      </div>
    )
  }

  const currentExercise = workout.exercises[currentIndex]

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex justify-between items-center px-margin h-14">
          <button onClick={() => router.back()} className="text-on-surface-variant hover:text-primary-container transition-colors p-1 -ml-1">
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>
          <h1 className="font-headline-md text-[18px] text-primary-container uppercase tracking-wider truncate px-xs font-bold">
            {workout.title}
          </h1>
          <button
            onClick={() => setChatOpen(true)}
            className="text-on-surface-variant hover:text-primary-container transition-colors p-1.5 bg-surface-container-high rounded-full border border-white/[0.08]"
          >
            <span className="material-symbols-outlined text-[20px]">support_agent</span>
          </button>
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[120px] px-margin flex flex-col gap-md">
        <div className="flex items-center gap-xs bg-surface-container px-sm py-xs rounded-full border border-white/[0.08] self-start">
          <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
          <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Session Active</span>
        </div>

        <div>
          <p className="font-label-caps text-label-caps text-primary-container/70 tracking-widest mb-[4px]">
            EXERCISE {currentIndex + 1} OF {workout.exercises.length}
          </p>
          <h2 className="font-headline-lg text-[28px] text-on-surface uppercase leading-tight">
            {currentExercise.name}
          </h2>
        </div>

        <div className="flex gap-1">
          {workout.exercises.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i < currentIndex ? 'bg-primary-container' :
                i === currentIndex ? 'bg-primary-container/50' : 'bg-surface-container-high'
              }`}
            />
          ))}
        </div>

        <ExerciseLogger
          key={currentIndex}
          exercise={currentExercise}
          onComplete={handleComplete}
          sortOrder={currentIndex}
        />

        {logged.length > 0 && (
          <div className="flex flex-col gap-xs">
            <p className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">
              Logged ({logged.length})
            </p>
            {logged.map((entry, i) => (
              <div key={i} className="bg-surface-container rounded-xl px-sm py-xs flex items-center justify-between border border-white/[0.06]">
                <span className="font-body-md text-[15px] text-on-surface">{entry.exercise.exercise_name}</span>
                <span className="font-mono text-[12px] text-primary-container">
                  {entry.exercise.exercise_type === 'strength'
                    ? `${entry.sets.length} sets`
                    : `${entry.exercise.duration_minutes}min`}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-gradient-to-t from-background via-background/95 to-transparent pt-10 pb-6 px-margin z-40">
        <button
          onClick={finishWorkout}
          disabled={saving || logged.length === 0}
          className={`w-full font-label-caps text-[14px] py-4 rounded-xl transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-xs border font-bold tracking-wider ${
            logged.length > 0
              ? 'border-primary-container text-primary-container hover:bg-primary-container hover:text-on-primary-container'
              : 'border-white/10 text-on-surface-variant/30 cursor-not-allowed'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">flag</span>
          {saving ? 'SAVING...' : 'FINISH WORKOUT'}
        </button>
      </div>

      {chatOpen && (
        <SessionChat
          workout={workout}
          currentExercise={currentExercise.name}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  )
}
