import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SessionChat } from '../SessionChat'
import type { SuggestedWorkout } from '@/lib/types'

const mockWorkout: SuggestedWorkout = {
  title: 'Push Day',
  estimated_minutes: 45,
  muscle_groups: ['chest'],
  exercises: [
    { name: 'Bench Press', type: 'strength', sets: 3, reps: 10, muscle_groups: ['chest'] },
  ],
}

beforeEach(() => {
  global.fetch = jest.fn()
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('SessionChat', () => {
  it('does NOT show Add to Plan button when reply has no substitute', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reply: 'Keep your elbows at 45 degrees to protect your shoulders.' }),
    })

    render(
      <SessionChat
        workout={mockWorkout}
        currentExercise="Bench Press"
        onClose={() => {}}
        onAddExercise={jest.fn()}
      />
    )

    fireEvent.click(screen.getByText("Don't know this exercise"))
    await waitFor(() => screen.getByText(/elbows/i))

    expect(screen.queryByRole('button', { name: /add "(.*?)" to plan/i })).not.toBeInTheDocument()
  })

  it('shows Add to Plan button when AI reply contains substitute phrasing', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: 'I suggest you substitute with **Push-Ups** instead of bench press. They target the same muscles.',
      }),
    })

    render(
      <SessionChat
        workout={mockWorkout}
        currentExercise="Bench Press"
        onClose={() => {}}
        onAddExercise={jest.fn()}
      />
    )

    fireEvent.click(screen.getByText('Suggest a substitute'))
    await waitFor(() => screen.getByText(/ADD "PUSH-UPS" TO PLAN/i))

    expect(screen.getByText(/ADD "PUSH-UPS" TO PLAN/i)).toBeInTheDocument()
  })

  it('calls onAddExercise with a valid SuggestedExercise when Add to Plan is clicked', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: 'Try substituting with "Push-Ups" instead. Great bodyweight option.',
      }),
    })

    const onAddExercise = jest.fn()
    render(
      <SessionChat
        workout={mockWorkout}
        currentExercise="Bench Press"
        onClose={() => {}}
        onAddExercise={onAddExercise}
      />
    )

    fireEvent.click(screen.getByText('Suggest a substitute'))
    await waitFor(() => screen.getByText(/ADD "PUSH-UPS" TO PLAN/i))
    fireEvent.click(screen.getByText(/ADD "PUSH-UPS" TO PLAN/i))

    expect(onAddExercise).toHaveBeenCalledTimes(1)
    expect(onAddExercise).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Push-Ups',
        type: 'strength',
        sets: 3,
        reps: 10,
      })
    )
  })

  it('hides Add to Plan button when onAddExercise prop is not provided', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reply: 'Try substituting with "Dumbbell Press" instead.',
      }),
    })

    render(
      <SessionChat
        workout={mockWorkout}
        currentExercise="Bench Press"
        onClose={() => {}}
        // no onAddExercise prop
      />
    )

    fireEvent.click(screen.getByText('Suggest a substitute'))
    await waitFor(() => screen.getByText(/Dumbbell Press/i))

    expect(screen.queryByRole('button', { name: /ADD "(.*?)" TO PLAN/i })).not.toBeInTheDocument()
  })
})
