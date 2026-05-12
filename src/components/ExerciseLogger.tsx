'use client'

import { useState } from 'react'
import type { SuggestedExercise, WorkoutExercise, WorkoutSetInput } from '@/lib/types'
import { RpeSelector } from '@/components/RpeSelector'

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
  effort: number | null
}

export function ExerciseLogger({ exercise, onComplete, sortOrder = 0 }: Props) {
  const initialSetCount = exercise.type === 'strength' ? (exercise.sets ?? 1) : 1

  const [rows, setRows] = useState<SetRowState[]>(
    Array.from({ length: initialSetCount }, () => ({
      weight: exercise.weight_kg?.toString() ?? '',
      reps: exercise.reps?.toString() ?? '',
      effort: null,
    })),
  )
  const [duration, setDuration] = useState(exercise.duration_minutes?.toString() ?? '')
  const [cardioEffort, setCardioEffort] = useState<number | null>(null)

  function updateRow(index: number, patch: Partial<SetRowState>) {
    setRows(prev => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows(prev => {
      const last = prev[prev.length - 1]
      return [...prev, last ? { ...last } : { weight: '', reps: '', effort: null }]
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
        perceived_effort: row.effort ?? 5,
      }))
      const avgEffort = Math.round(sets.reduce((s, r) => s + (r.perceived_effort ?? 5), 0) / sets.length)
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
          perceived_effort: cardioEffort ?? 5,
          sort_order: sortOrder,
        },
        sets: [{ set_number: 1, weight_kg: null, reps: null, perceived_effort: cardioEffort ?? 5 }],
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
          {rows.map((row, i) => (
            <div key={i} data-testid="set-row" className="bg-surface-container-high px-3 py-2 rounded-lg border border-white/[0.08] relative overflow-hidden flex flex-col gap-2">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary-container rounded-l-lg" />
              <div className="flex items-center gap-2">
                <span className="font-mono text-[12px] text-on-surface-variant w-5 text-center">{i + 1}</span>
                <input
                  data-testid="set-weight"
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={row.weight}
                  onChange={e => updateRow(i, { weight: e.target.value })}
                  className="w-20 bg-surface-container text-center font-mono text-on-surface py-1.5 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
                />
                <span className="text-xs text-on-surface-variant/50 font-mono">kg</span>
                <input
                  data-testid="set-reps"
                  type="number"
                  placeholder="0"
                  value={row.reps}
                  onChange={e => updateRow(i, { reps: e.target.value })}
                  className="w-16 bg-surface-container text-center font-mono text-on-surface py-1.5 rounded-lg border border-white/[0.08] focus:border-primary-container/50 outline-none text-[14px] transition-colors"
                />
                <span className="text-xs text-on-surface-variant/50 font-mono">reps</span>
                <div className="ml-auto">
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(i)} className="text-on-surface-variant/60 hover:text-error transition-colors" aria-label="Remove set">
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  )}
                </div>
              </div>
              <RpeSelector value={row.effort} onChange={val => updateRow(i, { effort: val })} />
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

          <RpeSelector value={cardioEffort} onChange={setCardioEffort} />
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
