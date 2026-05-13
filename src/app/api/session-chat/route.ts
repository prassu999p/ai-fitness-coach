import { NextResponse } from 'next/server'
import { streamText, stepCountIs } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'
import type { SuggestedWorkout } from '@/lib/types'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { todayWorkout: SuggestedWorkout; exerciseName: string; userMessage: string }
  try {
    body = await request.json()
    body.userMessage = body.userMessage.trim().slice(0, 1000)
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { data: equipment } = await supabase
    .from('user_equipment')
    .select('*')
    .eq('user_id', user.id)

  const equipmentList = (equipment ?? []).map((e: { name: string }) => e.name).join(', ')

  // Persist user message
  await supabase.from('trainer_messages').insert({
    user_id: user.id,
    role: 'user',
    content: body.userMessage,
    message_type: 'session_feedback',
    metadata: { exerciseName: body.exerciseName },
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  const result = streamText({
    model: agentModel,
    system: `You are a personal trainer coaching during an active workout session. The user is currently doing: ${body.exerciseName}. Today's workout: ${JSON.stringify(body.todayWorkout)}. Available equipment: ${equipmentList || 'bodyweight only'}. Give a 2-3 sentence practical response. If suggesting a substitute, name it specifically. Call add_trainer_message to save your reply.`,
    messages: [{ role: 'user', content: body.userMessage }],
    tools: createAgentTools(supabase, user.id),
    stopWhen: stepCountIs(3),
    abortSignal: AbortSignal.any([controller.signal, request.signal]),
    onFinish: () => clearTimeout(timeout),
    onError: () => clearTimeout(timeout),
  })

  return result.toTextStreamResponse()
}
