import { streamText, stepCountIs } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'

const SYSTEM_PROMPT = `You are an expert personal trainer and coach. You have access to the user's training program, workout history, and exercise performance data.

Always start by calling get_trainer_history({ limit: 20 }) to restore conversation context, then answer the user's question using whatever tools are helpful.

If the user requests a change to their program (e.g. swap an exercise, adjust load, change a day), call adjust_program_week with detailed reasoning.

Always end by calling add_trainer_message with your complete response text so it is saved to the conversation history.

Keep replies concise and practical. Use data from the tools. Be direct like a coach, not a chatbot.`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  let body: { message?: string }
  try {
    body = await request.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const userMessage = typeof body.message === 'string' ? body.message.trim().slice(0, 2000) : ''
  if (!userMessage) return new Response('Bad Request', { status: 400 })

  // Persist user message
  await supabase.from('trainer_messages').insert({
    user_id: user.id,
    role: 'user',
    content: userMessage,
    message_type: 'chat',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)

  try {
    const result = streamText({
      model: agentModel,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      tools: createAgentTools(supabase, user.id),
      stopWhen: stepCountIs(6),
      abortSignal: controller.signal,
      onFinish: () => clearTimeout(timeout),
    })

    return result.toTextStreamResponse()
  } catch {
    clearTimeout(timeout)
    return new Response(
      JSON.stringify({ error: 'Something went wrong, try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
