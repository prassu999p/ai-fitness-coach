'use client'

import { useState } from 'react'
import type { SuggestedExercise, WorkoutExercise, WorkoutSetInput } from '@/lib/types'

export interface CompletedExercise {
  exercise: Omit<WorkoutExercise, 'id' | 'workout_id'>
  sets: WorkoutSetInput[]
}

interface Props {
  exercise: SuggestedExercise
  onComplete: (payload: CompletedExercise) => void
  sortOrder?: number
}

interface SetRowState {
  weight: string
  reps: string
  effort: number
}

export function ExerciseLogger({ exercise, onComplete, sortOrder = 0 }: Props) {
  const initialSetCount = exercise.type === 'strength' ? (exercise.sets ?? 1) : 1

  const [rows, setRows] = useState<SetRowState[]>(
    Array.from({ length: initialSetCount }, () => ({
      weight: exercise.weight_kg?.toString() ?? '',
      reps: exercise.reps?.toString() ?? '',
      effort: 3,
    })),
  )
  const [duration, setDuration] = useState(exercise.duration_minutes?.toString() ?? '')
  const [cardioEffort, setCardioEffort] = useState(3)

  function updateRow(index: number, patch: Partial<SetRowState>) {
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows(prev => {
      const last = prev[prev.length - 1]
      return [...prev, last ? { ...last } : { weight: '', reps: '', effort: 3 }]
    })
  }

  function removeRow(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  function handleComplete() {
    if (exercise.type === 'strength') {
      const sets: WorkoutSetInput[] = rows.map((row, i) => ({
        set_number: i + 1,
        weight_kg: row.weight ? parseFloat(row.weight) : null,
        reps: row.reps ? parseInt(row.reps) : null,
        perceived_effort: row.effort,
      }))
      const avgEffort = Math.round(sets.reduce((s, r) => s + (r.perceived_effort ?? 3), 0) / sets.length)
      onComplete({
        exercise: {
          exercise_name: exercise.name,
          exercise_type: 'strength',
          sets: sets.length,
          reps: sets[0]?.reps ?? null,
          weight_kg: sets[0]?.weight_kg ?? null,
          duration_minutes: null,
          perceived_effort: avgEffort,
          sort_order: sortOrder,
        },
        sets,
      })
    } else {
      const dur = duration ? parseInt(duration) : null
      onComplete({
        exercise: {
          exercise_name: exercise.name,
          exercise_type: 'cardio',
          sets: null,
          reps: null,
          weight_kg: null,
          duration_minutes: dur,
          perceived_effort: cardioEffort,
          sort_order: sortOrder,
        },
        sets: [{ set_number: 1, weight_kg: null, reps: null, perceived_effort: cardioEffort }],
      })
    }
  }

  return (
    <div className="bg-surface-container rounded-xl border border-white/[0.06] p-sm flex flex-col gap-sm">
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
        <div className="flex flex-col gap-xs">
          <div className="grid grid-cols-12 gap-2 pb-[6px] border-b border-white/[0.06] font-label-caps text-[10px] text-on-surface-variant/50 text-center tracking-widest">
            <div className="col-span-1 text-left">#</div>
            <div className="col-span-3">KG</div>
            <div className="col-span-3">REPS</div>
            <div className="col-span-4">EFFORT</div>
            <div className="col-span-1"></div>
          </div>

          {rows.map((row, i) => (
            <div
              key={i}
              data-testid="set-row"
              className="grid grid-cols-12 gap-2 items-center bg-surface-container-high px-2 py-3 rounded-lg border border-white/[0.08] relative overflow-hidden"
            >
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary-container rounded-l-lg" />
              <div className="col-span-1 text-center font-mono text-[12px] text-on-surface-variant">{i + 1}</div>
              <div className="col-span-3">
                <input
                  data-testid="set-weight"
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={row.weight}
                  onChange={e => updateRow(i, { weight: e.target.value })}
                  className="w-full bg-surface-container text-center font-mono text-on-surface py-1.5 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
                />
              </div>
              <div className="col-span-3">
                <input
                  data-testid="set-reps"
                  type="number"
                  placeholder="0"
                  value={row.reps}
                  onChange={e => updateRow(i, { reps: e.target.value })}
                  className="w-full bg-surface-container text-center font-mono text-on-surface py-1.5 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
                />
              </div>
              <div className="col-span-4 flex items-center gap-1">
                <input
                  data-testid="set-effort"
                  type="range"
                  min={1}
                  max={5}
                  value={row.effort}
                  onChange={e => updateRow(i, { effort: parseInt(e.target.value) })}
                  className="w-full accent-[#c3f400]"
                />
                <span className="font-mono text-[11px] text-primary-container w-6 text-right">{row.effort}</span>
              </div>
              <div className="col-span-1 flex justify-end">
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(i)}
                    className="text-on-surface-variant/60 hover:text-error transition-colors"
                    aria-label="Remove set"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>
            </div>
          ))}

          <button
            onClick={addRow}
            className="self-start font-label-caps text-[11px] text-on-surface-variant hover:text-primary-container tracking-wider uppercase py-1 transition-colors"
          >
            + Add Set
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-sm">
          <div className="bg-surface-container-high px-2 py-3 rounded-lg border border-white/[0.08] relative overflow-hidden flex items-center gap-sm">
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-secondary-container rounded-l-lg" />
            <input
              type="number"
              placeholder="Duration (min)"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              className="flex-1 bg-surface-container text-center font-mono text-on-surface py-2 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
            />
          </div>

          <div className="flex flex-col gap-xs">
            <div className="flex items-center justify-between font-mono text-[11px] text-on-surface-variant/60">
              <span>EFFORT</span>
              <span className="text-primary-container">{cardioEffort}/5</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              value={cardioEffort}
              onChange={e => setCardioEffort(parseInt(e.target.value))}
              className="w-full accent-[#c3f400]"
            />
          </div>
        </div>
      )}

      <button
        onClick={handleComplete}
        className="bg-primary-container text-on-primary-container px-3 py-3 rounded-lg font-label-caps text-[12px] tracking-wider hover:brightness-110 active:scale-95 transition-all font-bold uppercase"
      >
        Complete Exercise
      </button>
    </div>
  )
}
