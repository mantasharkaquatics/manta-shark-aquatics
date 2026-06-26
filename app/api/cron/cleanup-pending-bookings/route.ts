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
  const now = new Date().toISOString()
  const { data: expired } = await supabase
    .from('bookings')
    .select('id, class_session_id')
    .eq('status', 'pending_partner')
    .lt('pending_expires_at', now)

  // 同時清除過期的 reschedule pending
  const { data: expiredReschedule } = await supabase
    .from('bookings')
    .select('id')
    .in('pending_action', ['reschedule', 'reschedule_initiator'])
    .lt('pending_expires_at', now)

  if ((expiredReschedule || []).length > 0) {
    const rids = (expiredReschedule || []).map((b: any) => b.id)
    await supabase.from('bookings').update({
      pending_action: null,
      pending_new_session_id: null,
      pending_expires_at: null,
    }).in('id', rids)
  }

  const ids = (expired || []).map(b => b.id)
  let deleted = 0
  if (ids.length > 0) {
    await supabase.from('bookings').delete().in('id', ids)
    deleted = ids.length
  }

  return NextResponse.json({ deleted, checked: (expired || []).length })
}
