import { NextResponse } from 'next/server'
import { generateText, stepCountIs } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { agentModel } from '@/lib/agent/client'
import { createAgentTools } from '@/lib/agent/tools'

const SYSTEM_PROMPT = `You are a strength coach performing a weekly training review.
1. Call get_current_program to get the current program and this week's data
2. Call get_workout_history({ days: 7 }) to get actual performance data (raw sets — ≤14 days)
3. Compare prescribed vs actual: volume (sets × reps), adherence, weight progression, and RPE trends
4. Decide on adjustments for next week: increase load if on track + low RPE, reduce volume if overreaching (high RPE), substitute if equipment issue
5. Call adjust_program_week for the NEXT week number with your adjustments and detailed reasoning
6. Call add_trainer_message with type "weekly_review" and a summary: adherence %, key lifts progress, what's changing next week and why. Under 200 words.`

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: activeWeek } = await supabase
    .from('program_weeks')
    .select('id, program_id, week_number, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!activeWeek) {
    return NextResponse.json({ skipped: true, reason: 'no active week' })
  }

  const { error: claimError } = await supabase
    .from('program_weeks')
    .update({ status: 'reviewing', updated_at: new Date().toISOString() })
    .eq('id', activeWeek.id)
    .eq('status', 'active')

  if (claimError) {
    return NextResponse.json({ skipped: true, reason: 'already claimed' })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  try {
    await generateText({
      model: agentModel,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: 'Perform the weekly review now.' }],
      tools: createAgentTools(supabase, user.id),
      stopWhen: stepCountIs(4),
      abortSignal: controller.signal,
    })
    clearTimeout(timeout)

    await supabase
      .from('program_weeks')
      .update({ status: 'completed', reviewed_at: new Date().toISOString() })
      .eq('id', activeWeek.id)

    await supabase
      .from('program_weeks')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('program_id', activeWeek.program_id)
      .eq('week_number', activeWeek.week_number + 1)

    return NextResponse.json({ success: true })
  } catch (error) {
    clearTimeout(timeout)
    const isTimeout = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json({ error: isTimeout ? 'timeout' : 'failed' }, { status: 500 })
  }
}
