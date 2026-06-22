import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 找所有已過期的 pending_partner 預約
  const { data: expired } = await supabase
    .from('bookings')
    .select('id, class_session_id')
    .eq('status', 'pending_partner')
    .eq('pending_action', 'confirm')
    .lt('pending_expires_at', new Date().toISOString())

  let cancelled = 0
  for (const b of expired || []) {
    await supabase.from('bookings').update({
      status: 'cancelled',
      pending_action: null,
    }).eq('id', b.id)

    if (b.class_session_id) {
      await supabase.rpc('decrement_enrolled', { session_id: b.class_session_id })
    }
    cancelled++
  }

  return NextResponse.json({ cancelled, checked: (expired || []).length })
}
