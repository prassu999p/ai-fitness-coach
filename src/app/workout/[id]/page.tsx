'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ExerciseLogger, type CompletedExercise } from '@/components/ExerciseLogger'
import { SessionChat } from '@/components/SessionChat'
import { format } from 'date-fns'
import type { SuggestedWorkout, SuggestedExercise } from '@/lib/types'

export default function WorkoutSessionPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()

  const [workout, setWorkout] = useState<SuggestedWorkout | null>(null)
  // Track which exercise index is currently being logged (expanded)
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  // logged[] stores completed exercises — keyed by sort_order for deduplication of instances
  const [logged, setLogged] = useState<CompletedExercise[]>([])
  // Indexes (sort_order) of exercises that were already saved to DB on a previous visit
  const [preCompletedIdxs, setPreCompletedIdxs] = useState<Set<number>>(new Set())
  const [chatOpen, setChatOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [startTime] = useState(new Date())

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 1. Load the workout record to check for a snapshot
      if (params.id) {
        const { data: workoutRecord } = await supabase
          .from('workouts')
          .select('suggestion_snapshot')
          .eq('id', params.id as string)
          .single()

        if (workoutRecord?.suggestion_snapshot) {
          setWorkout(workoutRecord.suggestion_snapshot as SuggestedWorkout)
        } else {
          // Fallback: Load today's global AI suggestion if no snapshot on the workout record
          const today = format(new Date(), 'yyyy-MM-dd')
          const { data: suggestionData } = await supabase
            .from('ai_suggestions')
            .select('suggested_workout')
            .eq('user_id', user.id)
            .eq('date', today)
            .single()
          if (suggestionData) setWorkout(suggestionData.suggested_workout as SuggestedWorkout)
        }

        // 2. Load already-logged exercises (Continue support)
        const { data: existingExercises } = await supabase
          .from('workout_exercises')
          .select('exercise_name, exercise_type, sets, reps, weight_kg, duration_minutes, perceived_effort, sort_order')
          .eq('workout_id', params.id as string)
          .order('sort_order', { ascending: true })

        if (existingExercises && existingExercises.length > 0) {
          // Mark these as pre-completed by their sort_order so we know which specific instance is done
          setPreCompletedIdxs(new Set(existingExercises.map(e => e.sort_order)))
        }
      }
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleComplete(entry: CompletedExercise, idx: number) {
    setLogged(prev => {
      // Replace existing entry for this specific instance (idx/sort_order) if re-logged
      const without = prev.filter(l => l.exercise.sort_order !== idx)
      return [...without, { ...entry, exercise: { ...entry.exercise, sort_order: idx } }]
    })
    setActiveIdx(null) // collapse after logging
  }

  function handleAddExercise(exercise: SuggestedExercise) {
    setWorkout(prev => {
      if (!prev) return prev
      return { ...prev, exercises: [...prev.exercises, exercise] }
    })
    setChatOpen(false)
  }

  async function finishWorkout() {
    if (!params.id) return
    setSaving(true)

    const durationMinutes = Math.round((Date.now() - startTime.getTime()) / 60000)

    await supabase
      .from('workouts')
      .update({ status: 'completed', duration_minutes: durationMinutes })
      .eq('id', params.id as string)

    if (logged.length > 0) {
      // Insert only newly logged exercises (not the pre-completed ones — they're already in DB)
      const newlyLogged = logged.filter(l => !preCompletedIdxs.has(l.exercise.sort_order))
      if (newlyLogged.length > 0) {
        const { data: insertedExercises } = await supabase
          .from('workout_exercises')
          .insert(newlyLogged.map(l => ({ ...l.exercise, workout_id: params.id as string })))
          .select()

        if (insertedExercises) {
          const exBySort = new Map(
            insertedExercises.map(ex => [ex.sort_order as number, ex.id as string]),
          )
          const setRows = newlyLogged.flatMap(entry => {
            const exId = exBySort.get(entry.exercise.sort_order)
            if (!exId) return []
            return entry.sets.map(s => ({
              workout_exercise_id: exId,
              set_number: s.set_number,
              weight_kg: s.weight_kg,
              reps: s.reps,
              perceived_effort: s.perceived_effort,
            }))
          })
          if (setRows.length > 0) {
            await supabase.from('workout_sets').insert(setRows)
          }
        }
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

  const loggedIdxs = new Set(logged.map(l => l.exercise.sort_order))
  const completedCount = loggedIdxs.size + preCompletedIdxs.size
  const totalCount = workout.exercises.length

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
        {/* Status pill */}
        <div className="flex items-center gap-sm">
          <div className="flex items-center gap-xs bg-surface-container px-sm py-xs rounded-full border border-white/[0.08]">
            <div className="w-2 h-2 rounded-full bg-primary-container animate-pulse" />
            <span className="font-mono text-[11px] text-on-surface-variant uppercase tracking-wider">Session Active</span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-xs">
          <div className="flex items-center justify-between">
            <p className="font-label-caps text-label-caps text-primary-container/70 tracking-widest">
              {completedCount} OF {totalCount} EXERCISES
            </p>
            {completedCount > 0 && completedCount === totalCount && (
              <span className="font-label-caps text-[10px] text-primary-container tracking-widest">ALL DONE ✓</span>
            )}
          </div>
          <div className="flex gap-1">
            {workout.exercises.map((ex, i) => {
              const isDone = preCompletedIdxs.has(i) || loggedIdxs.has(i)
              return (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    isDone ? 'bg-primary-container' : 'bg-surface-container-high'
                  }`}
                />
              )
            })}
          </div>
        </div>

        {/* All exercises list */}
        <div className="flex flex-col gap-sm">
          {workout.exercises.map((ex, i) => {
            const isDone = preCompletedIdxs.has(i) || loggedIdxs.has(i)
            const isActive = activeIdx === i

            return (
              <div
                key={`${ex.name}-${i}`}
                className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                  isDone
                    ? 'border-primary-container/30 bg-primary-container/5'
                    : isActive
                    ? 'border-primary-container/50 bg-surface-container'
                    : 'border-white/[0.06] bg-surface-container'
                }`}
              >
                {/* Exercise header row */}
                <div className="flex items-center justify-between px-sm py-sm gap-xs">
                  <div className="flex items-center gap-xs min-w-0 flex-1">
                    {/* Status icon */}
                    {isDone ? (
                      <div className="w-7 h-7 rounded-full bg-primary-container/15 border border-primary-container flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-[15px] text-primary-container" style={{ fontVariationSettings: "'wght' 600" }}>check</span>
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-surface-container-high border border-white/10 flex items-center justify-center flex-shrink-0">
                        <span className="font-mono text-[11px] text-on-surface-variant">{i + 1}</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className={`font-headline-md text-[15px] uppercase leading-tight truncate ${isDone ? 'text-primary-container' : 'text-on-surface'}`}>
                        {ex.name}
                      </p>
                      <p className="font-label-caps text-[9px] text-on-surface-variant/50 tracking-widest mt-[1px]">
                        {ex.muscle_groups.join(' · ').toUpperCase()}
                        {ex.type === 'strength' && ex.sets && ` · ${ex.sets}×${ex.reps ?? '?'}`}
                        {ex.type === 'cardio' && ex.duration_minutes && ` · ${ex.duration_minutes}min`}
                      </p>
                    </div>
                  </div>

                  {/* Action button */}
                  {isDone ? (
                    <span className="font-label-caps text-[10px] text-primary-container/70 tracking-widest flex-shrink-0">DONE</span>
                  ) : (
                    <button
                      id={`log-exercise-${i}`}
                      onClick={() => setActiveIdx(isActive ? null : i)}
                      className={`flex-shrink-0 flex items-center gap-[4px] font-label-caps text-[11px] tracking-wider px-sm py-xs rounded-xl transition-all border ${
                        isActive
                          ? 'bg-surface-container-high border-white/10 text-on-surface-variant'
                          : 'bg-primary-container/10 border-primary-container/30 text-primary-container hover:bg-primary-container/20'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">{isActive ? 'keyboard_arrow_up' : 'edit'}</span>
                      {isActive ? 'HIDE' : 'LOG'}
                    </button>
                  )}
                </div>

                {/* Inline logger — expands below header */}
                {isActive && !isDone && (
                  <div className="border-t border-white/[0.06] px-sm pb-sm pt-xs">
                    <ExerciseLogger
                      key={`logger-${i}`}
                      exercise={ex}
                      onComplete={entry => handleComplete(entry, i)}
                      sortOrder={i}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>

      {/* Finish button */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-gradient-to-t from-background via-background/95 to-transparent pt-10 pb-6 px-margin z-40">
        <button
          onClick={finishWorkout}
          disabled={saving || completedCount === 0}
          className={`w-full font-label-caps text-[14px] py-4 rounded-xl transition-all duration-300 active:scale-[0.98] flex items-center justify-center gap-xs border font-bold tracking-wider ${
            completedCount > 0
              ? 'border-primary-container text-primary-container hover:bg-primary-container hover:text-on-primary-container'
              : 'border-white/10 text-on-surface-variant/30 cursor-not-allowed'
          }`}
        >
          <span className="material-symbols-outlined text-[20px]">flag</span>
          {saving ? 'SAVING...' : completedCount === totalCount ? 'FINISH WORKOUT ✓' : `FINISH (${completedCount}/${totalCount})`}
        </button>
      </div>

      {chatOpen && (
        <SessionChat
          workout={workout}
          currentExercise={activeIdx !== null ? workout.exercises[activeIdx]?.name ?? workout.exercises[0].name : workout.exercises[0].name}
          onClose={() => setChatOpen(false)}
          onAddExercise={handleAddExercise}
        />
      )}
    </div>
  )
}
