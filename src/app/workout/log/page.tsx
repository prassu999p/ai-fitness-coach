'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ExerciseLogger } from '@/components/ExerciseLogger'
import { BottomNav } from '@/components/BottomNav'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { WorkoutExercise, SuggestedExercise } from '@/lib/types'

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
  const [logged, setLogged] = useState<Omit<WorkoutExercise, 'id' | 'workout_id'>[]>([])
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const activeExercise: SuggestedExercise = customName
    ? { ...selectedExercise, name: customName }
    : selectedExercise

  function handleLog(entry: Omit<WorkoutExercise, 'id' | 'workout_id'>) {
    setLogged(prev => [...prev, entry])
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
      await supabase.from('workout_exercises').insert(
        logged.map(ex => ({ ...ex, workout_id: workoutRow.id }))
      )
    }

    router.push('/dashboard')
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Fixed Header */}
      <header className="fixed top-0 w-full max-w-md z-50 bg-surface/60 backdrop-blur-xl border-b border-white/5 flex justify-between items-center px-margin h-16">
        <button onClick={() => router.back()} className="text-primary hover:opacity-80 transition-opacity p-2 -ml-2">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="font-headline-lg text-headline-lg text-primary uppercase tracking-wider">Log Workout</h1>
        <div className="w-8" />
      </header>

      <main className="flex-grow pt-[88px] pb-[104px] px-margin flex flex-col gap-md">
        <div>
          <h2 className="font-display-lg text-display-lg text-primary uppercase">Log Session</h2>
          <p className="font-body-lg text-body-lg text-on-surface-variant mt-xs">Record a past workout</p>
        </div>

        {/* Date Picker */}
        <div className="bg-surface-container-low rounded-xl border border-white/5 p-sm">
          <label className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest block mb-xs">
            Workout Date
          </label>
          <input
            type="date"
            value={date}
            max={format(new Date(), 'yyyy-MM-dd')}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-surface-container-high text-on-surface rounded-lg px-sm py-xs border-b-2 border-outline-variant focus:border-primary-container outline-none font-mono text-on-surface"
          />
        </div>

        {/* Exercise Selector */}
        <div className="bg-surface-container-low rounded-xl border border-white/5 p-sm flex flex-col gap-xs">
          <label className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
            Exercise
          </label>
          <select
            value={selectedExercise.name}
            onChange={e => {
              const ex = COMMON_EXERCISES.find(x => x.name === e.target.value)
              if (ex) setSelectedExercise(ex)
              setCustomName('')
            }}
            className="w-full bg-surface-container-high text-on-surface rounded-lg px-sm py-xs border-b-2 border-outline-variant focus:border-primary-container outline-none font-body-md text-body-md"
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
            className="w-full bg-surface-container-high text-on-surface placeholder-on-surface-variant/50 rounded-lg px-sm py-xs border-b-2 border-outline-variant focus:border-primary-container outline-none font-body-md text-body-md"
          />
        </div>

        {/* Exercise Logger */}
        <ExerciseLogger exercise={activeExercise} onLog={handleLog} sortOrder={logged.length} />

        {/* Logged exercises */}
        {logged.length > 0 && (
          <div className="flex flex-col gap-xs">
            <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">
              Logged ({logged.length})
            </p>
            {logged.map((ex, i) => (
              <div key={i} className="bg-surface-container-high rounded-xl px-sm py-xs flex items-center justify-between border border-white/5">
                <span className="font-body-md text-body-md text-on-surface">{ex.exercise_name}</span>
                <span className="font-data-sm text-data-sm text-primary-container">
                  {ex.exercise_type === 'strength'
                    ? `${ex.sets}×${ex.reps} @ ${ex.weight_kg}kg`
                    : `${ex.duration_minutes}min`}
                </span>
              </div>
            ))}

            <button
              onClick={saveWorkout}
              disabled={saving}
              className="w-full bg-gradient-to-br from-primary-container to-[#8ba800] text-on-primary-container font-label-caps text-label-caps py-sm rounded-xl uppercase tracking-wider glow-primary hover:opacity-90 disabled:opacity-50 transition-all mt-xs flex items-center justify-center gap-xs"
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
