import { NextRequest, NextResponse } from 'next/server'
import { generateText, stepCountIs } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'
import { validateProgram } from '@/lib/agent/validateProgram'
import { format } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'

export const maxDuration = 60

const PREVIEW_SYSTEM = `You are an expert strength coach. The user wants a new training program.
1. Call get_user_profile and get_workout_history({ days: 60 }) in parallel (this returns a PerformanceSummary, not raw data — use it to gauge current capacity)
2. Design a full periodized block: 2–3 named phases, week-by-week exercise prescription
3. Return ONLY a JSON object (no markdown fences) in this exact shape:
{
  "preview": {
    "phases": [{ "name": string, "week_range": [number, number], "focus": string, "top_exercises": string[] }],
    "duration_weeks": number,
    "sessions_per_week": number,
    "notes": string
  },
  "program": {
    "goal": "hypertrophy" | "strength" | "fat_loss" | "endurance" | "general_fitness",
    "duration_weeks": number,
    "start_date": "YYYY-MM-DD",
    "phases": [{ "name": string, "week_range": [number, number], "focus": string, "intensity": string }],
    "week_plan": {
      "1": { // week number as string key
        "Monday": { "focus": string, "exercises": [{ "name": string, "sets": number, "reps": number }] },
        "Tuesday": { "focus": string, "exercises": [...] },
        ... // all training days
      },
      "2": { ... },
      ... // up to duration_weeks
    }
  }
}
Do not call create_program yet. The user will review the preview first.
IMPORTANT: The total volume for any single muscle group (chest, back, shoulders, quads, hamstrings, arms, core) MUST NOT exceed 30 sets per week.`

const COMMIT_SYSTEM = `You are an expert strength coach. The user has approved (or given feedback on) a training program draft.
Given the original program JSON and any user feedback, either commit it as-is or incorporate the feedback and commit.
1. If feedback is provided, revise the program accordingly
2. Call create_program with the final program
3. Call add_trainer_message with type "check_in" and a warm welcome + week 1 summary`

async function runGeneration(
  supabase: SupabaseClient,
  userId: string,
  draftId: string,
  params: {
    goal: string
    durationWeeks: number
    action: 'generate' | 'revise'
    feedback?: string
    draftProgram?: object
  }
) {
  const { goal, durationWeeks, action, feedback, draftProgram } = params
  const tools = createAgentTools(supabase, userId)

  try {
    const { text } = await generateText({
      model: agentModel,
      system: PREVIEW_SYSTEM + `\nToday: ${format(new Date(), 'yyyy-MM-dd')}. Goal: ${goal}. Duration: ${durationWeeks} weeks.${feedback ? `\nUser feedback on previous draft: ${feedback}` : ''}`,
      messages: [{
        role: 'user',
        content: (action === 'revise' && draftProgram)
          ? `Revise this program:\n\`\`\`json\n${JSON.stringify(draftProgram)}\n\`\`\`\n\nFeedback: ${feedback ?? 'General revision'}`
          : 'Generate my program now.',
      }],
      tools: { get_user_profile: tools.get_user_profile, get_workout_history: tools.get_workout_history },
      stopWhen: stepCountIs(3),
    })

    let parsed: { preview: unknown; program: unknown }
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('Agent returned malformed JSON')
    }

    if (
      !parsed || typeof parsed !== 'object' ||
      !parsed.preview || typeof parsed.preview !== 'object' || Array.isArray(parsed.preview) ||
      !parsed.program || typeof parsed.program !== 'object' || Array.isArray(parsed.program)
    ) {
      throw new Error('Agent returned invalid payload shape')
    }

    await supabase.from('program_drafts').update({
      status: 'ready',
      preview: parsed.preview,
      draft_program: parsed.program,
      updated_at: new Date().toISOString(),
    }).eq('id', draftId)
  } catch (error) {
    await supabase.from('program_drafts').update({
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Generation failed',
      updated_at: new Date().toISOString(),
    }).eq('id', draftId)
  }
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const draftId = req.nextUrl.searchParams.get('draftId')
  if (!draftId) return NextResponse.json({ error: 'draftId required' }, { status: 400 })

  const { data, error } = await supabase
    .from('program_drafts')
    .select('status, preview, draft_program, error_message')
    .eq('id', draftId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data) return NextResponse.json({ error: 'Draft not found' }, { status: 404 })

  return NextResponse.json({
    status: data.status,
    preview: data.preview ?? null,
    draftProgram: data.draft_program ?? null,
    errorMessage: data.error_message ?? null,
  })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    action?: 'generate' | 'confirm' | 'revise'
    feedback?: string
    draftProgram?: object
    goal?: string
    durationWeeks?: number
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const action = body.action ?? 'generate'
  const goal = typeof body.goal === 'string' ? body.goal.slice(0, 100) : 'hypertrophy'
  const feedback = typeof body.feedback === 'string' ? body.feedback.slice(0, 1000) : undefined
  const durationWeeks = typeof body.durationWeeks === 'number' ? Math.min(Math.max(body.durationWeeks, 4), 16) : 8

  if (action === 'generate' || action === 'revise') {
    const { data: draft, error: insertError } = await supabase
      .from('program_drafts')
      .insert({ user_id: user.id, status: 'pending' })
      .select('id')
      .single()

    if (insertError || !draft) {
      return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
    }

    // Fire-and-forget: Node.js keeps running after response is sent.
    // On Vercel, wrap with waitUntil() from @vercel/functions if added.
    void runGeneration(supabase, user.id, draft.id, {
      goal,
      durationWeeks,
      action,
      feedback,
      draftProgram: body.draftProgram,
    })

    return NextResponse.json({ draftId: draft.id, status: 'pending' })
  }

  // action === 'confirm'
  if (!body.draftProgram) return NextResponse.json({ error: 'draftProgram required' }, { status: 400 })

  let sanitizedDraft: object
  try {
    const validation = validateProgram(body.draftProgram as Parameters<typeof validateProgram>[0])
    if (!validation.valid) {
      return NextResponse.json({ error: `Invalid draft program: ${validation.errors.join('; ')}` }, { status: 400 })
    }
    sanitizedDraft = validation.normalized
  } catch {
    return NextResponse.json({ error: 'Invalid draft program structure' }, { status: 400 })
  }

  const tools = createAgentTools(supabase, user.id)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 55_000)

  try {
    await generateText({
      model: agentModel,
      system: COMMIT_SYSTEM,
      messages: [{
        role: 'user',
        content: `Commit this program to the database:\n\`\`\`json\n${JSON.stringify(sanitizedDraft)}\`\`\`${feedback ? `\n\nUser asked to change: ${feedback}` : ''}`,
      }],
      tools,
      stopWhen: stepCountIs(6),
      abortSignal: controller.signal,
    })
    clearTimeout(timeout)
    return NextResponse.json({ success: true })
  } catch (error) {
    clearTimeout(timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out. Please try again.' }, { status: 504 })
    }
    console.error('[generate-program] confirm failed. Full error:', error)
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack)
    }
    return NextResponse.json({ 
      error: 'Failed to save program. Please try again.',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
