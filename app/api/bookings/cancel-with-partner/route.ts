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

  // 取得此 booking 資料
  const { data: booking } = await supabase
    .from('bookings')
    .select('id, class_session_id, lesson_credit_id, parent_id, student_id, status, partner_parent_id')
    .eq('id', booking_id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Ownership check: a parent may only cancel their own bookings (admin accounts have no parents row)
  const { data: callerParent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (callerParent && booking.parent_id !== callerParent.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 取消此 booking
  await supabase.from('bookings').update({ status: 'cancelled', pending_action: null }).eq('id', booking_id)
  await supabase.rpc('decrement_enrolled', { session_id: booking.class_session_id })

  // 退回 credit
  if (booking.lesson_credit_id) {
    const { data: credit } = await supabase.from('lesson_credits').select('used_credits').eq('id', booking.lesson_credit_id).single()
    if (credit) await supabase.from('lesson_credits').update({ used_credits: Math.max(0, credit.used_credits - 1) }).eq('id', booking.lesson_credit_id)
  }

  // 同帳戶同 session 其他 booking 也取消（同帳戶 1-on-2）
  const { data: sameParentBookings } = await supabase
    .from('bookings')
    .select('id, lesson_credit_id, class_session_id')
    .eq('parent_id', booking.parent_id)
    .eq('class_session_id', booking.class_session_id)
    .neq('id', booking_id)
    .neq('status', 'cancelled')

  for (const pb of sameParentBookings || []) {
    await supabase.from('bookings').update({ status: 'cancelled', pending_action: null }).eq('id', pb.id)
    await supabase.rpc('decrement_enrolled', { session_id: pb.class_session_id })
    if (pb.lesson_credit_id) {
      const { data: credit } = await supabase.from('lesson_credits').select('used_credits').eq('id', pb.lesson_credit_id).single()
      if (credit) await supabase.from('lesson_credits').update({ used_credits: Math.max(0, credit.used_credits - 1) }).eq('id', pb.lesson_credit_id)
    }
  }

  // 找同一時段另一方的 booking 並取消
  const { data: session } = await supabase
    .from('class_sessions')
    .select('session_date, start_time, coach_id')
    .eq('id', booking.class_session_id)
    .single()

  if (session) {
    const { data: sameSessions } = await supabase
      .from('class_sessions')
      .select('id')
      .eq('session_date', session.session_date)
      .eq('start_time', session.start_time)
      .eq('coach_id', session.coach_id)

    const sessionIds = (sameSessions || []).map((s: any) => s.id)

    if (sessionIds.length > 0) {
      const { data: partnerBookings } = await supabase
        .from('bookings')
        .select('id, lesson_credit_id, class_session_id')
        .neq('parent_id', booking.parent_id)
        .in('class_session_id', sessionIds)
        .neq('status', 'cancelled')

      for (const pb of partnerBookings || []) {
        await supabase.from('bookings').update({ status: 'cancelled', pending_action: null }).eq('id', pb.id)
        await supabase.rpc('decrement_enrolled', { session_id: pb.class_session_id })
        if (pb.lesson_credit_id) {
          const { data: credit } = await supabase.from('lesson_credits').select('used_credits').eq('id', pb.lesson_credit_id).single()
          if (credit) await supabase.from('lesson_credits').update({ used_credits: Math.max(0, credit.used_credits - 1) }).eq('id', pb.lesson_credit_id)
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
