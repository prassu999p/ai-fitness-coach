import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('program_weeks')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('status', 'reviewing')

  if (error) {
    return NextResponse.json({ error: 'Failed to reset' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
