export interface ExerciseHistoryEntry {
  weight_kg: number | null
  reps: number | null
  date: string
}

export type OverloadResult = {
  recommended_weight_kg: number
  basis: string
  confidence: 'high' | 'medium' | 'low'
  rpe_note?: string
}

export function calculateProgressiveOverload(params: {
  exerciseName: string
  targetSets: number
  targetReps: number
  history: ExerciseHistoryEntry[]
  prescribedWeight?: number | null
  lastRpe?: number | null
}): OverloadResult {
  const { targetReps, history, prescribedWeight, lastRpe } = params

  const valid = history
    .filter(h => h.weight_kg !== null && h.weight_kg > 0 && h.reps !== null)
    .slice(0, 3)

  if (valid.length === 0) {
    return {
      recommended_weight_kg: prescribedWeight ?? 0,
      basis: prescribedWeight != null ? 'no history — using prescribed weight' : 'no history or prescription',
      confidence: 'low',
    }
  }

  const lastWeight = valid[0].weight_kg!
  const allHitTarget = valid.every(h => (h.reps ?? 0) >= targetReps)

  // RPE overrides: check before standard progression
  if (lastRpe != null && lastRpe >= 9) {
    return {
      recommended_weight_kg: lastWeight,
      basis: `RPE ${lastRpe} last session — hold weight to prevent overreach`,
      confidence: 'medium',
      rpe_note: 'overreach risk — do not increase load',
    }
  }

  if (allHitTarget && valid.length >= 2) {
    const increment = lastRpe != null && lastRpe <= 6 ? 5 : 2.5
    return {
      recommended_weight_kg: lastWeight + increment,
      basis: `${valid.length} sessions hitting target — progress (+${increment}kg)`,
      confidence: 'high',
      rpe_note: lastRpe != null && lastRpe <= 6 ? 'felt easy — larger increment' : undefined,
    }
  }

  if ((valid[0].reps ?? 0) >= targetReps) {
    return {
      recommended_weight_kg: lastWeight,
      basis: `hit target last session — maintain ${lastWeight}kg`,
      confidence: 'medium',
    }
  }

  return {
    recommended_weight_kg: lastWeight,
    basis: `below target reps last session (${valid[0].reps}/${targetReps}) — maintain ${lastWeight}kg`,
    confidence: 'medium',
  }
}
