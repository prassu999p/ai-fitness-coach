import { render, screen, fireEvent } from '@testing-library/react'
import { ExerciseLogger } from '@/components/ExerciseLogger'
import type { SuggestedExercise } from '@/lib/types'

const strengthExercise: SuggestedExercise = {
  name: 'Bench Press',
  type: 'strength',
  sets: 3,
  reps: 8,
  weight_kg: 80,
  muscle_groups: ['chest'],
}

const cardioExercise: SuggestedExercise = {
  name: 'Treadmill Run',
  type: 'cardio',
  duration_minutes: 20,
  muscle_groups: ['cardio'],
}

describe('ExerciseLogger — multi-set strength', () => {
  it('renders N rows for strength exercise where N = exercise.sets', () => {
    render(<ExerciseLogger exercise={strengthExercise} onComplete={jest.fn()} />)
    expect(screen.getAllByTestId('set-row')).toHaveLength(3)
  })

  it('pre-fills each row with the AI target weight and reps', () => {
    render(<ExerciseLogger exercise={strengthExercise} onComplete={jest.fn()} />)
    const weights = screen.getAllByTestId('set-weight') as HTMLInputElement[]
    const reps = screen.getAllByTestId('set-reps') as HTMLInputElement[]
    expect(weights.every(w => w.value === '80')).toBe(true)
    expect(reps.every(r => r.value === '8')).toBe(true)
  })

  it('adds a new row when "Add Set" is clicked', () => {
    render(<ExerciseLogger exercise={strengthExercise} onComplete={jest.fn()} />)
    fireEvent.click(screen.getByText(/add set/i))
    expect(screen.getAllByTestId('set-row')).toHaveLength(4)
  })

  it('calls onComplete with one exercise meta and N set entries', () => {
    const onComplete = jest.fn()
    render(<ExerciseLogger exercise={strengthExercise} onComplete={onComplete} />)

    const weights = screen.getAllByTestId('set-weight') as HTMLInputElement[]
    const reps = screen.getAllByTestId('set-reps') as HTMLInputElement[]

    fireEvent.change(weights[0], { target: { value: '60' } })
    fireEvent.change(reps[0], { target: { value: '10' } })
    fireEvent.change(weights[1], { target: { value: '70' } })
    fireEvent.change(reps[1], { target: { value: '8' } })
    fireEvent.change(weights[2], { target: { value: '80' } })
    fireEvent.change(reps[2], { target: { value: '6' } })

    fireEvent.click(screen.getByText(/complete exercise/i))

    expect(onComplete).toHaveBeenCalledTimes(1)
    const arg = onComplete.mock.calls[0][0]
    expect(arg.exercise.exercise_name).toBe('Bench Press')
    expect(arg.exercise.exercise_type).toBe('strength')
    expect(arg.sets).toHaveLength(3)
    expect(arg.sets[0]).toEqual(expect.objectContaining({ set_number: 1, weight_kg: 60, reps: 10 }))
    expect(arg.sets[1]).toEqual(expect.objectContaining({ set_number: 2, weight_kg: 70, reps: 8 }))
    expect(arg.sets[2]).toEqual(expect.objectContaining({ set_number: 3, weight_kg: 80, reps: 6 }))
  })
})

describe('ExerciseLogger — cardio', () => {
  it('shows duration field for cardio exercises', () => {
    render(<ExerciseLogger exercise={cardioExercise} onComplete={jest.fn()} />)
    expect(screen.getByPlaceholderText(/duration/i)).toBeInTheDocument()
  })

  it('calls onComplete with a single set entry for cardio', () => {
    const onComplete = jest.fn()
    render(<ExerciseLogger exercise={cardioExercise} onComplete={onComplete} />)
    fireEvent.change(screen.getByPlaceholderText(/duration/i), { target: { value: '25' } })
    fireEvent.click(screen.getByText(/complete exercise/i))

    expect(onComplete).toHaveBeenCalledTimes(1)
    const arg = onComplete.mock.calls[0][0]
    expect(arg.exercise.exercise_name).toBe('Treadmill Run')
    expect(arg.exercise.exercise_type).toBe('cardio')
    expect(arg.exercise.duration_minutes).toBe(25)
  })
})
