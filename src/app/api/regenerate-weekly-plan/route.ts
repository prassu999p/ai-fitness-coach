import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { format, startOfWeek } from 'date-fns'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const today = format(now, 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  await supabase.from('weekly_plans').delete().eq('user_id', user.id).eq('week_start', weekStart)
  await supabase.from('ai_suggestions').delete().eq('user_id', user.id).eq('date', today)

  // Delegate generation by calling the suggest-workout handler indirectly.
  // The caller will re-fetch /api/suggest-workout right after this, so we just return ok.
  return NextResponse.json({ ok: true })
}
