import { streamText, stepCountIs } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'

const SYSTEM_PROMPT = `You are an expert personal trainer and coach. You have access to the user's training program, workout history, and exercise performance data.

## Startup (every request)
Call these two tools in parallel at the start of EVERY request before answering:
1. get_current_program — always needed so you know whether a program exists and what week is active
2. get_trainer_history({ limit: 20 }) — restores conversation context

Do not ask the user whether they have a program. Call get_current_program and check yourself.

## Program adjustments
If the user requests a change to their program (swap an exercise, adjust load, change a day), call adjust_program_week with detailed reasoning. You MUST have an active program to do this — if get_current_program returns null, tell the user to create one first.

## Creating a new program
If the user wants a new program committed, call create_program. You MUST generate the full week_plan yourself — never ask the user to provide JSON.

week_plan schema: Record<weekString, Record<dayString, { focus: string, exercises: Array<{ name: string, sets: number, reps: number, weight_kg?: number, tempo?: string, rpe?: number }> }>>

Example (2-week, Mon/Wed/Fri):
{
  "1": {
    "Monday": { "focus": "Upper Strength", "exercises": [{ "name": "Bench Press", "sets": 4, "reps": 5 }, { "name": "Barbell Row", "sets": 4, "reps": 5 }] },
    "Wednesday": { "focus": "Lower Strength", "exercises": [{ "name": "Squat", "sets": 4, "reps": 5 }, { "name": "Romanian Deadlift", "sets": 3, "reps": 8 }] },
    "Friday": { "focus": "Full Body", "exercises": [{ "name": "Overhead Press", "sets": 3, "reps": 8 }, { "name": "Deadlift", "sets": 3, "reps": 5 }] }
  },
  "2": { ... }
}

Generate all weeks up to duration_weeks. Do not ask the user for week_plan data — create it yourself based on the goal and training days.

Keep replies concise and practical. Be direct like a coach, not a chatbot.`

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

  await supabase.from('trainer_messages').insert({
    user_id: user.id,
    role: 'user',
    content: userMessage,
    message_type: 'chat',
  })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 55_000)
  const clearTimer = () => clearTimeout(timeout)

  const result = streamText({
    model: agentModel,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: createAgentTools(supabase, user.id),
    stopWhen: stepCountIs(10),
    abortSignal: AbortSignal.any([controller.signal, request.signal]),
    onFinish: async ({ text, toolCalls }) => {
      clearTimer()
      // Persist trainer reply if the model didn't call add_trainer_message itself
      const savedByTool = toolCalls.some(t => t.toolName === 'add_trainer_message')
      if (!savedByTool && text) {
        await supabase.from('trainer_messages').insert({
          user_id: user.id,
          role: 'trainer',
          content: text,
          message_type: 'chat',
        })
      }
    },
    onError: clearTimer,
  })

  return result.toTextStreamResponse()
}
