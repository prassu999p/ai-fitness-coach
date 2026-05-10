'use client'

import { useState } from 'react'
import type { SuggestedExercise, WorkoutExercise } from '@/lib/types'

interface Props {
  exercise: SuggestedExercise
  onLog: (entry: Omit<WorkoutExercise, 'id' | 'workout_id'>) => void
  sortOrder?: number
}

export function ExerciseLogger({ exercise, onLog, sortOrder = 0 }: Props) {
  const [sets, setSets] = useState(exercise.sets?.toString() ?? '')
  const [reps, setReps] = useState(exercise.reps?.toString() ?? '')
  const [weightKg, setWeightKg] = useState(exercise.weight_kg?.toString() ?? '')
  const [duration, setDuration] = useState(exercise.duration_minutes?.toString() ?? '')
  const [effort, setEffort] = useState(3)

  function handleSubmit() {
    onLog({
      exercise_name: exercise.name,
      exercise_type: exercise.type,
      sets: sets ? parseInt(sets) : null,
      reps: reps ? parseInt(reps) : null,
      weight_kg: weightKg ? parseFloat(weightKg) : null,
      duration_minutes: duration ? parseInt(duration) : null,
      perceived_effort: effort,
      sort_order: sortOrder,
    })
  }

  return (
    <div className="bg-surface-container-low rounded-xl border border-white/5 p-sm flex flex-col gap-sm" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      {/* Exercise Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface uppercase">{exercise.name}</h3>
          <p className="font-label-caps text-label-caps text-on-surface-variant tracking-widest mt-base">
            {exercise.muscle_groups.join(' · ').toUpperCase()}
          </p>
          {exercise.notes && (
            <p className="font-body-md text-body-md text-surface-tint mt-xs">{exercise.notes}</p>
          )}
        </div>
        <span className={`material-symbols-outlined text-2xl ${exercise.type === 'cardio' ? 'text-secondary-container' : 'text-on-surface-variant'}`}>
          {exercise.type === 'cardio' ? 'directions_run' : 'fitness_center'}
        </span>
      </div>

      {exercise.type === 'strength' ? (
        /* Strength: SET/KG/REPS grid with column headers */
        <div className="flex flex-col gap-xs">
          <div className="grid grid-cols-12 gap-2 pb-2 border-b border-white/5 font-label-caps text-label-caps text-on-surface-variant text-center">
            <div className="col-span-3 text-left">KG</div>
            <div className="col-span-3">REPS</div>
            <div className="col-span-3">SETS</div>
            <div className="col-span-3 text-right"></div>
          </div>
          {/* Active row with Volt Lime left border */}
          <div className="grid grid-cols-12 gap-2 items-center bg-surface-container px-2 py-3 rounded-lg border border-white/10 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary-container rounded-l-lg" />
            <div className="col-span-3">
              <input
                type="number"
                placeholder="Weight (kg)"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
                step="0.5"
                className="w-full bg-surface-container-high text-center font-mono text-on-surface py-2 rounded-t-md border-b-2 border-outline-variant focus:border-primary-container outline-none text-sm"
              />
            </div>
            <div className="col-span-3">
              <input
                type="number"
                placeholder="Reps"
                value={reps}
                onChange={e => setReps(e.target.value)}
                className="w-full bg-surface-container-high text-center font-mono text-on-surface py-2 rounded-t-md border-b-2 border-outline-variant focus:border-primary-container outline-none text-sm"
              />
            </div>
            <div className="col-span-3">
              <input
                type="number"
                placeholder="Sets"
                value={sets}
                onChange={e => setSets(e.target.value)}
                className="w-full bg-surface-container-high text-center font-mono text-on-surface py-2 rounded-t-md border-b-2 border-outline-variant focus:border-primary-container outline-none text-sm"
              />
            </div>
            <div className="col-span-3 flex justify-end">
              <button
                onClick={handleSubmit}
                className="bg-gradient-to-br from-primary-container to-[#506600] text-on-primary-container px-3 py-2 rounded-md font-label-caps text-label-caps tracking-wide hover:opacity-90 active:scale-95 transition-all shadow-[0_0_15px_rgba(195,244,0,0.3)]"
              >
                Log Set
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Cardio: Duration + effort slider */
        <div className="flex flex-col gap-sm">
          <div className="bg-surface-container px-2 py-3 rounded-lg border border-white/10 relative overflow-hidden flex items-center gap-sm">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-secondary-container rounded-l-lg" />
            <div className="flex-1">
              <input
                type="number"
                placeholder="Duration (min)"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                className="w-full bg-surface-container-high text-center font-mono text-on-surface py-2 rounded-t-md border-b-2 border-outline-variant focus:border-primary-container outline-none text-sm"
              />
            </div>
            <button
              onClick={handleSubmit}
              className="bg-gradient-to-br from-primary-container to-[#506600] text-on-primary-container px-3 py-2 rounded-md font-label-caps text-label-caps tracking-wide hover:opacity-90 active:scale-95 transition-all shadow-[0_0_15px_rgba(195,244,0,0.3)]"
            >
              Log Set
            </button>
          </div>

          {/* Effort label */}
          <div className="flex items-center justify-between font-data-sm text-data-sm text-on-surface-variant">
            <span>EFFORT LEVEL</span>
            <span className="text-primary-container">{Math.round((effort / 5) * 100)}%</span>
          </div>
        </div>
      )}

      {/* Effort Slider (strength) */}
      {exercise.type === 'strength' && (
        <div className="flex flex-col gap-xs">
          <div className="flex items-center justify-between font-data-sm text-data-sm text-on-surface-variant">
            <span>EFFORT</span>
            <span className="text-primary-container">{effort}/5</span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            value={effort}
            onChange={e => setEffort(parseInt(e.target.value))}
            className="w-full accent-[#c3f400]"
          />
        </div>
      )}
    </div>
  )
}
