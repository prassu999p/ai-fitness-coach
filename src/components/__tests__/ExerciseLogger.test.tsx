import { render, screen, fireEvent } from '@testing-library/react'
import { ExerciseLogger } from '@/components/ExerciseLogger'
import type { SuggestedExercise } from '@/lib/types'

const strengthExercise: SuggestedExercise = {
  name: 'Bench Press',
  type: 'strength',
  sets: 4,
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

describe('ExerciseLogger', () => {
  it('shows sets and reps fields for strength exercises', () => {
    render(<ExerciseLogger exercise={strengthExercise} onLog={jest.fn()} />)
    expect(screen.getByPlaceholderText('Sets')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Reps')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Weight (kg)')).toBeInTheDocument()
  })

  it('shows duration field for cardio exercises', () => {
    render(<ExerciseLogger exercise={cardioExercise} onLog={jest.fn()} />)
    expect(screen.getByPlaceholderText('Duration (min)')).toBeInTheDocument()
  })

  it('calls onLog with correct data when submitted', () => {
    const onLog = jest.fn()
    render(<ExerciseLogger exercise={strengthExercise} onLog={onLog} />)

    fireEvent.change(screen.getByPlaceholderText('Sets'), { target: { value: '4' } })
    fireEvent.change(screen.getByPlaceholderText('Reps'), { target: { value: '8' } })
    fireEvent.change(screen.getByPlaceholderText('Weight (kg)'), { target: { value: '80' } })
    fireEvent.click(screen.getByText('Log Set'))

    expect(onLog).toHaveBeenCalledWith(expect.objectContaining({
      exercise_name: 'Bench Press',
      exercise_type: 'strength',
      sets: 4,
      reps: 8,
      weight_kg: 80,
    }))
  })
})
