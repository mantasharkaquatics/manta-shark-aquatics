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

  const { data: parent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 取得自己的 booking（需要是 pending reschedule）
  const { data: myBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, partner_booking_id, lesson_credit_id, pending_new_session_id, pending_action')
    .eq('id', booking_id)
    .eq('pending_action', 'reschedule')
    .single()

  if (!myBooking) return NextResponse.json({ error: '預約不存在或狀態不符' }, { status: 404 })
  if (myBooking.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!myBooking.pending_new_session_id) return NextResponse.json({ error: '無待確認的新時段' }, { status: 400 })

  const partnerBookingId = myBooking.partner_booking_id
  if (!partnerBookingId) return NextResponse.json({ error: '找不到夥伴預約' }, { status: 404 })

  const { data: partnerBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, lesson_credit_id, pending_new_session_id')
    .eq('id', partnerBookingId)
    .single()

  if (!partnerBooking) return NextResponse.json({ error: '夥伴預約不存在' }, { status: 404 })

  const newSessionId = myBooking.pending_new_session_id

  // 取得新 session
  const { data: newSession } = await supabase
    .from('class_sessions')
    .select('id, enrolled_count, max_students, coach_id, session_date, start_time, course_type_id')
    .eq('id', newSessionId)
    .single()

  if (!newSession) return NextResponse.json({ error: '新時段不存在' }, { status: 404 })

  // 競搶保護：檢查新 session 容量
  if (newSession.enrolled_count + 2 > newSession.max_students) {
    // 清除雙方 pending，維持原時段
    await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.id)
    await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', partnerBookingId)
    return NextResponse.json({ error: '新時段已被預約，改期失敗，維持原時段' }, { status: 409 })
  }

  // 競搶保護：檢查教練衝突
  const { data: conflictSessions } = await supabase
    .from('class_sessions')
    .select('id')
    .eq('coach_id', newSession.coach_id)
    .eq('session_date', newSession.session_date)
    .eq('start_time', newSession.start_time)
    .neq('id', newSession.id)
  const conflictIds = (conflictSessions || []).map((s: any) => s.id)
  if (conflictIds.length > 0) {
    const { data: conflictBookings } = await supabase
      .from('bookings').select('id')
      .in('class_session_id', conflictIds)
      .not('status', 'in', '("cancelled","pending_partner")')
    if (conflictBookings && conflictBookings.length > 0) {
      await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.id)
      await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', partnerBookingId)
      return NextResponse.json({ error: '新時段教練已有其他預約，改期失敗，維持原時段' }, { status: 409 })
    }
  }

  // 取消舊 booking
  await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: 'rescheduled' }).eq('id', myBooking.id)
  await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: 'rescheduled' }).eq('id', partnerBookingId)

  // 舊 session enrolled_count -2
  await supabase.rpc('decrement_enrolled', { session_id: myBooking.class_session_id })
  await supabase.rpc('decrement_enrolled', { session_id: myBooking.class_session_id })

  // 建立新的雙方 booking
  const now = new Date().toISOString()
  const { data: newMyBooking } = await supabase.from('bookings').insert({
    class_session_id: newSessionId,
    parent_id: myBooking.parent_id,
    student_id: myBooking.student_id,
    lesson_credit_id: myBooking.lesson_credit_id,
    status: 'confirmed',
    pending_action: null,
    created_at: now,
  }).select('id').single()

  const { data: newPartnerBooking } = await supabase.from('bookings').insert({
    class_session_id: newSessionId,
    parent_id: partnerBooking.parent_id,
    student_id: partnerBooking.student_id,
    lesson_credit_id: partnerBooking.lesson_credit_id,
    status: 'confirmed',
    pending_action: null,
    created_at: now,
  }).select('id').single()

  // 互相設定 partner_booking_id
  if (newMyBooking && newPartnerBooking) {
    await supabase.from('bookings').update({ partner_booking_id: newPartnerBooking.id }).eq('id', newMyBooking.id)
    await supabase.from('bookings').update({ partner_booking_id: newMyBooking.id }).eq('id', newPartnerBooking.id)
  }

  // 新 session enrolled_count +2
  await supabase.rpc('increment_enrolled', { session_id: newSessionId })
  await supabase.rpc('increment_enrolled', { session_id: newSessionId })

  return NextResponse.json({ success: true })
}
