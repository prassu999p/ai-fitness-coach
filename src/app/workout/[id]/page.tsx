'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ExerciseLogger } from '@/components/ExerciseLogger'
import { SessionChat } from '@/components/SessionChat'
import { format } from 'date-fns'
import type { SuggestedWorkout, WorkoutExercise } from '@/lib/types'

export default function WorkoutSessionPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [workout, setWorkout] = useState<SuggestedWorkout | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loggedExercises, setLoggedExercises] = useState<Omit<WorkoutExercise, 'id' | 'workout_id'>[]>([])
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

  function handleLog(entry: Omit<WorkoutExercise, 'id' | 'workout_id'>) {
    setLoggedExercises(prev => [...prev, { ...entry, sort_order: currentIndex }])
    if (workout && currentIndex < workout.exercises.length - 1) {
      setCurrentIndex(prev => prev + 1)
    }
  }

  async function finishWorkout() {
    if (loggedExercises.length === 0 || !params.id) return
    setSaving(true)

    await supabase
      .from('workouts')
      .update({
        status: 'completed',
        duration_minutes: Math.round((Date.now() - startTime.getTime()) / 60000),
      })
      .eq('id', params.id as string)

    await supabase.from('workout_exercises').insert(
      loggedExercises.map(ex => ({ ...ex, workout_id: params.id as string }))
    )

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
  const isLastExercise = currentIndex === workout.exercises.length - 1

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="fixed top-0 w-full max-w-md z-50 bg-surface/60 backdrop-blur-xl border-b border-white/5 flex justify-between items-center px-margin h-16">
        <button onClick={() => router.back()} className="text-primary hover:opacity-80 transition-opacity p-2 -ml-2">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-headline-md text-headline-md text-primary uppercase tracking-wider truncate px-xs">
          {workout.title}
        </h1>
        <button
          onClick={() => setChatOpen(true)}
          className="text-on-surface-variant hover:text-primary transition-colors p-2 bg-surface-container rounded-full border border-white/5"
        >
          <span className="material-symbols-outlined">support_agent</span>
        </button>
      </header>

      <main className="flex-grow pt-[88px] pb-[120px] px-margin flex flex-col gap-md">
        {/* Session Active Indicator */}
        <div className="flex items-center gap-xs bg-surface-container-high px-sm py-xs rounded-full border border-white/10 self-start">
          <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
          <span className="font-data-sm text-data-sm text-on-surface-variant uppercase tracking-wider">Session Active</span>
        </div>

        {/* Exercise counter */}
        <div>
          <p className="font-label-caps text-label-caps text-primary-container tracking-widest mb-xs">
            EXERCISE {currentIndex + 1} OF {workout.exercises.length}
          </p>
          <h2 className="font-headline-lg text-headline-lg text-on-surface uppercase">
            {currentExercise.name}
          </h2>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1">
          {workout.exercises.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                i < currentIndex ? 'bg-primary-container' :
                i === currentIndex ? 'bg-primary-container/60' : 'bg-surface-container-high'
              }`}
            />
          ))}
        </div>

        {/* Exercise Logger */}
        <ExerciseLogger
          exercise={currentExercise}
          onLog={handleLog}
          sortOrder={currentIndex}
        />

        {/* Logged exercises this session */}
        {loggedExercises.length > 0 && (
          <div className="flex flex-col gap-xs">
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
              Logged ({loggedExercises.length})
            </p>
            {loggedExercises.map((ex, i) => (
              <div key={i} className="bg-surface-container-high rounded-xl px-sm py-xs flex items-center justify-between border border-white/5">
                <span className="font-body-md text-body-md text-on-surface">{ex.exercise_name}</span>
                <span className="font-data-sm text-data-sm text-primary-container">
                  {ex.exercise_type === 'strength'
                    ? `${ex.sets}×${ex.reps} @ ${ex.weight_kg}kg`
                    : `${ex.duration_minutes}min`}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Fixed Bottom: Finish Workout */}
      <div className="fixed bottom-0 left-0 w-full max-w-md bg-gradient-to-t from-background via-background/90 to-transparent pt-12 pb-8 px-margin z-40">
        <button
          onClick={finishWorkout}
          disabled={saving || loggedExercises.length === 0}
          className={`w-full font-headline-md text-headline-md py-4 rounded-xl transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-xs border-2 ${
            loggedExercises.length > 0
              ? 'border-primary-container text-primary-container hover:bg-primary-container hover:text-on-primary-container glow-primary'
              : 'border-outline-variant text-on-surface-variant opacity-40 cursor-not-allowed'
          }`}
        >
          <span className="material-symbols-outlined">flag</span>
          {saving ? 'SAVING...' : 'FINISH WORKOUT'}
        </button>
      </div>

      {/* Session Chat Overlay */}
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
