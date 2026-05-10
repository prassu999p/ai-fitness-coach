import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { callOpenRouter } from '@/lib/openrouter'
import { buildSessionChatPrompt } from '@/lib/prompts'
import type { SuggestedWorkout } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as {
    todayWorkout: SuggestedWorkout
    exerciseName: string
    userMessage: string
  }

  const { data: equipment } = await supabase
    .from('user_equipment')
    .select('*')
    .eq('user_id', user.id)

  const prompt = buildSessionChatPrompt(
    body.todayWorkout,
    equipment ?? [],
    body.exerciseName,
    body.userMessage
  )

  try {
    const reply = await callOpenRouter([{ role: 'user', content: prompt }])
    return NextResponse.json({ reply })
  } catch {
    return NextResponse.json(
      { reply: "I'm having trouble connecting right now. Try a similar exercise with the same equipment." },
      { status: 200 }
    )
  }
}
