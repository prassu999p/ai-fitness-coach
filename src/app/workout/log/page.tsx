'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ExerciseLogger, type CompletedExercise } from '@/components/ExerciseLogger'
import { BottomNav } from '@/components/BottomNav'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { SuggestedExercise } from '@/lib/types'

const COMMON_EXERCISES: SuggestedExercise[] = [
  { name: 'Bench Press', type: 'strength', sets: 4, reps: 8, weight_kg: 60, muscle_groups: ['chest'] },
  { name: 'Squat', type: 'strength', sets: 4, reps: 8, weight_kg: 80, muscle_groups: ['legs'] },
  { name: 'Deadlift', type: 'strength', sets: 3, reps: 5, weight_kg: 100, muscle_groups: ['back', 'legs'] },
  { name: 'Pull-up', type: 'strength', sets: 3, reps: 8, weight_kg: 0, muscle_groups: ['back'] },
  { name: 'Overhead Press', type: 'strength', sets: 3, reps: 8, weight_kg: 40, muscle_groups: ['shoulders'] },
  { name: 'Barbell Row', type: 'strength', sets: 3, reps: 10, weight_kg: 60, muscle_groups: ['back'] },
  { name: 'Dumbbell Curl', type: 'strength', sets: 3, reps: 12, weight_kg: 15, muscle_groups: ['biceps'] },
  { name: 'Tricep Dip', type: 'strength', sets: 3, reps: 12, weight_kg: 0, muscle_groups: ['triceps'] },
  { name: 'Treadmill Run', type: 'cardio', duration_minutes: 30, muscle_groups: ['cardio'] },
  { name: 'Cycling', type: 'cardio', duration_minutes: 30, muscle_groups: ['cardio'] },
  { name: 'Rowing Machine', type: 'cardio', duration_minutes: 20, muscle_groups: ['cardio'] },
]

export default function PostWorkoutLogPage() {
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [selectedExercise, setSelectedExercise] = useState<SuggestedExercise>(COMMON_EXERCISES[0])
  const [customName, setCustomName] = useState('')
  const [logged, setLogged] = useState<CompletedExercise[]>([])
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const activeExercise: SuggestedExercise = customName
    ? { ...selectedExercise, name: customName }
    : selectedExercise

  function handleComplete(entry: CompletedExercise) {
    setLogged(prev => [...prev, { ...entry, exercise: { ...entry.exercise, sort_order: prev.length } }])
  }

  async function saveWorkout() {
    if (logged.length === 0) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: workoutRow } = await supabase
      .from('workouts')
      .insert({ user_id: user.id, date, status: 'completed' })
      .select()
      .single()

    if (workoutRow) {
      const { data: insertedExercises } = await supabase
        .from('workout_exercises')
        .insert(logged.map(l => ({ ...l.exercise, workout_id: workoutRow.id })))
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
    }

    router.push('/dashboard')
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex justify-between items-center px-margin h-14">
          <button onClick={() => router.back()} className="text-on-surface-variant hover:text-primary-container transition-colors p-1 -ml-1">
            <span className="material-symbols-outlined text-[22px]">arrow_back</span>
          </button>
          <h1 className="font-headline-lg text-[20px] text-primary-container uppercase tracking-wider font-bold">Log Workout</h1>
          <div className="w-8" />
        </div>
      </header>

      <main className="flex-grow pt-[72px] pb-[88px] px-margin flex flex-col gap-md">
        <div className="pt-xs">
          <h2 className="font-headline-lg text-[28px] text-on-surface uppercase">Log Session</h2>
          <p className="font-body-md text-[15px] text-on-surface-variant mt-[4px]">Record a past workout</p>
        </div>

        {/* Date Picker */}
        <div className="bg-surface-container rounded-xl border border-white/[0.06] p-sm">
          <label className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest block mb-xs">
            Workout Date
          </label>
          <input
            type="date"
            value={date}
            max={format(new Date(), 'yyyy-MM-dd')}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-surface-container-high text-on-surface rounded-lg px-sm py-xs border border-white/[0.08] focus:border-primary-container/50 outline-none font-mono text-on-surface transition-colors"
          />
        </div>

        {/* Exercise Selector */}
        <div className="bg-surface-container rounded-xl border border-white/[0.06] p-sm flex flex-col gap-xs">
          <label className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">
            Exercise
          </label>
          <select
            value={selectedExercise.name}
            onChange={e => {
              const ex = COMMON_EXERCISES.find(x => x.name === e.target.value)
              if (ex) setSelectedExercise(ex)
              setCustomName('')
            }}
            className="w-full bg-surface-container-high text-on-surface rounded-lg px-sm py-xs border border-white/[0.08] focus:border-primary-container/50 outline-none font-body-md text-body-md transition-colors"
          >
            {COMMON_EXERCISES.map(ex => (
              <option key={ex.name} value={ex.name} className="bg-surface-container-high">
                {ex.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Or type a custom exercise name..."
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            className="w-full bg-surface-container-high text-on-surface placeholder-on-surface-variant/40 rounded-lg px-sm py-xs border border-white/[0.08] focus:border-primary-container/50 outline-none font-body-md text-[14px] transition-colors"
          />
        </div>

        {/* Exercise Logger */}
        <ExerciseLogger key={`${activeExercise.name}-${logged.length}`} exercise={activeExercise} onComplete={handleComplete} sortOrder={logged.length} />

        {/* Logged exercises */}
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

            <button
              onClick={saveWorkout}
              disabled={saving}
              className="w-full bg-primary-container text-on-primary-container font-label-caps text-[14px] py-3.5 rounded-xl uppercase tracking-wider hover:brightness-110 disabled:opacity-50 transition-all mt-xs flex items-center justify-center gap-xs font-bold"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              {saving ? 'Saving...' : 'Save Workout'}
            </button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  )
}
