import { validateProgram } from '@/lib/agent/validateProgram'

const validProgram = {
  goal: 'hypertrophy' as const,
  duration_weeks: 8,
  start_date: '2026-05-12',
  phases: [{ name: 'Base', week_range: [1, 8] as [number, number], focus: 'volume', intensity: 'moderate' }],
  week_plan: {
    '1': {
      mon: { focus: 'push', exercises: [{ name: 'Bench Press', sets: 4, reps: 8, weight_kg: 80 }] },
    },
  },
}

describe('validateProgram', () => {
  it('returns valid for a well-formed program', () => {
    const result = validateProgram(validProgram)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('normalises known exercise aliases', () => {
    const program = { ...validProgram, week_plan: { '1': { mon: { focus: 'push', exercises: [{ name: 'BB Bench', sets: 4, reps: 8 }] } } } }
    const result = validateProgram(program)
    expect(result.normalized.week_plan['1']['mon'].exercises![0].name).toBe('Bench Press')
  })

  it('rejects excessive weekly sets per muscle group', () => {
    const exercises = Array.from({ length: 15 }, () => ({ name: 'Bench Press', sets: 4, reps: 8 }))
    const program = { ...validProgram, week_plan: { '1': { mon: { focus: 'push', exercises } } } }
    const result = validateProgram(program)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/sets/)
  })
})
