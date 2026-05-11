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
    <div className="bg-surface-container rounded-xl border border-white/[0.06] p-sm flex flex-col gap-sm">
      {/* Exercise Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-headline-md text-[20px] text-on-surface uppercase">{exercise.name}</h3>
          <p className="font-label-caps text-[10px] text-on-surface-variant/60 tracking-widest mt-[2px]">
            {exercise.muscle_groups.join(' · ').toUpperCase()}
          </p>
          {exercise.notes && (
            <p className="font-body-md text-[14px] text-primary-container/70 mt-xs">{exercise.notes}</p>
          )}
        </div>
        <span className={`material-symbols-outlined text-[24px] ${exercise.type === 'cardio' ? 'text-secondary-container' : 'text-on-surface-variant/40'}`}>
          {exercise.type === 'cardio' ? 'directions_run' : 'fitness_center'}
        </span>
      </div>

      {exercise.type === 'strength' ? (
        /* Strength: SET/KG/REPS grid with column headers */
        <div className="flex flex-col gap-xs">
          <div className="grid grid-cols-12 gap-2 pb-[6px] border-b border-white/[0.06] font-label-caps text-[10px] text-on-surface-variant/50 text-center tracking-widest">
            <div className="col-span-3 text-left">KG</div>
            <div className="col-span-3">REPS</div>
            <div className="col-span-3">SETS</div>
            <div className="col-span-3 text-right"></div>
          </div>
          {/* Active row */}
          <div className="grid grid-cols-12 gap-2 items-center bg-surface-container-high px-2 py-3 rounded-lg border border-white/[0.08] relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary-container rounded-l-lg" />
            <div className="col-span-3">
              <input
                type="number"
                placeholder="0"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
                step="0.5"
                className="w-full bg-surface-container text-center font-mono text-on-surface py-2 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
              />
            </div>
            <div className="col-span-3">
              <input
                type="number"
                placeholder="0"
                value={reps}
                onChange={e => setReps(e.target.value)}
                className="w-full bg-surface-container text-center font-mono text-on-surface py-2 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
              />
            </div>
            <div className="col-span-3">
              <input
                type="number"
                placeholder="0"
                value={sets}
                onChange={e => setSets(e.target.value)}
                className="w-full bg-surface-container text-center font-mono text-on-surface py-2 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
              />
            </div>
            <div className="col-span-3 flex justify-end">
              <button
                onClick={handleSubmit}
                className="bg-primary-container text-on-primary-container px-3 py-2 rounded-lg font-label-caps text-[11px] tracking-wider hover:brightness-110 active:scale-95 transition-all font-bold"
              >
                Log Set
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Cardio: Duration + effort slider */
        <div className="flex flex-col gap-sm">
          <div className="bg-surface-container-high px-2 py-3 rounded-lg border border-white/[0.08] relative overflow-hidden flex items-center gap-sm">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-secondary-container rounded-l-lg" />
            <div className="flex-1">
              <input
                type="number"
                placeholder="Duration (min)"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                className="w-full bg-surface-container text-center font-mono text-on-surface py-2 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
              />
            </div>
            <button
              onClick={handleSubmit}
              className="bg-primary-container text-on-primary-container px-3 py-2 rounded-lg font-label-caps text-[11px] tracking-wider hover:brightness-110 active:scale-95 transition-all font-bold"
            >
              Log Set
            </button>
          </div>

          {/* Effort label */}
          <div className="flex items-center justify-between font-mono text-[11px] text-on-surface-variant/60">
            <span>EFFORT LEVEL</span>
            <span className="text-primary-container">{Math.round((effort / 5) * 100)}%</span>
          </div>
        </div>
      )}

      {/* Effort Slider (strength) */}
      {exercise.type === 'strength' && (
        <div className="flex flex-col gap-xs">
          <div className="flex items-center justify-between font-mono text-[11px] text-on-surface-variant/60">
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
