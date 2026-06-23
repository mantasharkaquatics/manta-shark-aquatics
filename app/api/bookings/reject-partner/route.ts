import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: pending } = await supabase
    .from('bookings')
    .select('id, class_session_id, partner_parent_id, status')
    .eq('id', booking_id)
    .single()

  if (!pending || pending.status !== 'pending_partner') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 取得此 session 的 date/time/coach
  const { data: pendingSession } = await supabase
    .from('class_sessions')
    .select('session_date, start_time, coach_id')
    .eq('id', pending.class_session_id)
    .single()

  // 取消 pending booking
  await supabase.from('bookings').update({ status: 'cancelled', pending_action: null }).eq('id', booking_id)
  await supabase.rpc('decrement_enrolled', { session_id: pending.class_session_id })

  // 找發起方同一時段的 confirmed booking（同 coach + date + time）
  if (pendingSession && pending.partner_parent_id) {
    const { data: sameSessions } = await supabase
      .from('class_sessions')
      .select('id')
      .eq('session_date', pendingSession.session_date)
      .eq('start_time', pendingSession.start_time)
      .eq('coach_id', pendingSession.coach_id)

    const sessionIds = (sameSessions || []).map((s: any) => s.id)

    if (sessionIds.length > 0) {
      const { data: initiatorBooking } = await supabase
        .from('bookings')
        .select('id, lesson_credit_id, class_session_id')
        .eq('parent_id', pending.partner_parent_id)
        .eq('status', 'confirmed')
        .in('class_session_id', sessionIds)
        .maybeSingle()

      if (initiatorBooking) {
        await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', initiatorBooking.id)
        await supabase.rpc('decrement_enrolled', { session_id: initiatorBooking.class_session_id })
        if (initiatorBooking.lesson_credit_id) {
          const { data: credit } = await supabase.from('lesson_credits').select('used_credits').eq('id', initiatorBooking.lesson_credit_id).single()
          if (credit) await supabase.from('lesson_credits').update({ used_credits: Math.max(0, credit.used_credits - 1) }).eq('id', initiatorBooking.lesson_credit_id)
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
