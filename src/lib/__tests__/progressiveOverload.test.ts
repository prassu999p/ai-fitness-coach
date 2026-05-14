import { calculateProgressiveOverload } from '@/lib/progressiveOverload'

describe('calculateProgressiveOverload', () => {
  it('returns prescribed weight with low confidence when no history', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Squat',
      targetSets: 3,
      targetReps: 8,
      history: [],
      prescribedWeight: 60,
    })
    expect(result.recommended_weight_kg).toBe(60)
    expect(result.confidence).toBe('low')
  })

  it('returns 0 with low confidence when no history and no prescription', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Squat',
      targetSets: 3,
      targetReps: 8,
      history: [],
    })
    expect(result.recommended_weight_kg).toBe(0)
    expect(result.confidence).toBe('low')
  })

  it('advances weight by 2.5kg when 2+ sessions hitting target reps', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Bench Press',
      targetSets: 4,
      targetReps: 8,
      history: [
        { weight_kg: 80, reps: 9, date: '2026-05-11' },
        { weight_kg: 80, reps: 8, date: '2026-05-08' },
      ],
    })
    expect(result.recommended_weight_kg).toBe(82.5)
    expect(result.confidence).toBe('high')
  })

  it('maintains weight when only 1 session hitting target', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Bench Press',
      targetSets: 4,
      targetReps: 8,
      history: [{ weight_kg: 80, reps: 8, date: '2026-05-11' }],
    })
    expect(result.recommended_weight_kg).toBe(80)
    expect(result.confidence).toBe('medium')
  })

  it('maintains weight when below target reps last session', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Bench Press',
      targetSets: 4,
      targetReps: 8,
      history: [{ weight_kg: 80, reps: 6, date: '2026-05-11' }],
    })
    expect(result.recommended_weight_kg).toBe(80)
    expect(result.confidence).toBe('medium')
  })

  it('adds extra 5kg on top of normal increment when last RPE was ≤ 6', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Bench Press',
      targetSets: 4,
      targetReps: 8,
      history: [
        { weight_kg: 80, reps: 9, date: '2026-05-11' },
        { weight_kg: 80, reps: 8, date: '2026-05-08' },
      ],
      lastRpe: 6,
    })
    // RPE ≤ 6 means it was easy — advance by 5 instead of 2.5
    expect(result.recommended_weight_kg).toBe(85)
    expect(result.rpe_note).toMatch(/easy/)
  })

  it('holds weight and flags overreach when last RPE was 10', () => {
    const result = calculateProgressiveOverload({
      exerciseName: 'Bench Press',
      targetSets: 4,
      targetReps: 8,
      history: [{ weight_kg: 80, reps: 8, date: '2026-05-11' }],
      lastRpe: 10,
    })
    expect(result.recommended_weight_kg).toBe(80)
    expect(result.rpe_note).toMatch(/overreach/)
  })
})
