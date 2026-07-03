import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const supabase = auth.svc

  // 取得所有 active bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, lesson_credit_id')
    .eq('class_session_id', session_id)
    .neq('status', 'cancelled')

  // 退回每筆 credit
  for (const b of bookings || []) {
    if (b.lesson_credit_id) {
      await supabase.rpc('decrement_used_credits', { credit_id: b.lesson_credit_id })
    }
  }

  // 取消 session 和所有 bookings
  await supabase.from('class_sessions').update({ status: 'cancelled' }).eq('id', session_id)
  await supabase.from('bookings').update({ status: 'cancelled' }).eq('class_session_id', session_id)
  await supabase.rpc('decrement_enrolled', { session_id })

  return NextResponse.json({ ok: true })
}
