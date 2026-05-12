import { NextRequest, NextResponse } from 'next/server'
import { generateText, stepCountIs } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'
import { format } from 'date-fns'

const PREVIEW_SYSTEM = `You are an expert strength coach. The user wants a new training program.
1. Call get_user_profile and get_workout_history({ days: 60 }) in parallel (this returns a PerformanceSummary, not raw data — use it to gauge current capacity)
2. Design a full periodized block: 2–3 named phases, week-by-week exercise prescription
3. Return ONLY a JSON object (no markdown fences) in this exact shape:
{
  "preview": {
    "phases": [{ "name": string, "week_range": [n, n], "focus": string, "top_exercises": string[] }],
    "duration_weeks": number,
    "sessions_per_week": number,
    "notes": string
  },
  "program": { /* full ProgramInput ready for create_program */ }
}
Do not call create_program yet. The user will review the preview first.`

const COMMIT_SYSTEM = `You are an expert strength coach. The user has approved (or given feedback on) a training program draft.
Given the original program JSON and any user feedback, either commit it as-is or incorporate the feedback and commit.
1. If feedback is provided, revise the program accordingly
2. Call create_program with the final program
3. Call add_trainer_message with type "check_in" and a warm welcome + week 1 summary`

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    action?: 'generate' | 'confirm' | 'revise'
    feedback?: string
    draftProgram?: object
    goal?: string
    durationWeeks?: number
  }

  const action = body.action ?? 'generate'
  const tools = createAgentTools(supabase, user.id)

  if (action === 'generate' || action === 'revise') {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30_000)

    try {
      const { text } = await generateText({
        model: agentModel,
        system: PREVIEW_SYSTEM + `\nToday: ${format(new Date(), 'yyyy-MM-dd')}. Goal: ${body.goal ?? 'hypertrophy'}. Duration: ${body.durationWeeks ?? 8} weeks.${body.feedback ? `\nUser feedback on previous draft: ${body.feedback}` : ''}`,
        messages: [{ role: 'user', content: body.feedback ? `Revise the program based on my feedback: ${body.feedback}` : 'Generate my program now.' }],
        tools: { get_user_profile: tools.get_user_profile, get_workout_history: tools.get_workout_history },
        stopWhen: stepCountIs(3),
        abortSignal: controller.signal,
      })
      clearTimeout(timeout)

      let parsed: { preview: object; program: object }
      try {
        parsed = JSON.parse(text)
      } catch {
        return NextResponse.json({ error: 'Agent returned malformed JSON' }, { status: 500 })
      }
      return NextResponse.json({ preview: parsed.preview, draftProgram: parsed.program })
    } catch (error) {
      clearTimeout(timeout)
      return NextResponse.json({ error: 'timeout' }, { status: 504 })
    }
  }

  // action === 'confirm'
  if (!body.draftProgram) return NextResponse.json({ error: 'draftProgram required' }, { status: 400 })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    await generateText({
      model: agentModel,
      system: COMMIT_SYSTEM,
      messages: [{
        role: 'user',
        content: `Commit this program to the database:\n\`\`\`json\n${JSON.stringify(body.draftProgram)}\`\`\`${body.feedback ? `\n\nUser asked to change: ${body.feedback}` : ''}`,
      }],
      tools,
      stopWhen: stepCountIs(6),
      abortSignal: controller.signal,
    })
    clearTimeout(timeout)
    return NextResponse.json({ success: true })
  } catch (error) {
    clearTimeout(timeout)
    return NextResponse.json({ error: 'timeout' }, { status: 504 })
  }
}
