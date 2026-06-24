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

  const { booking_id, new_session_id } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 取得發起方 booking
  const { data: myBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, partner_booking_id, status')
    .eq('id', booking_id)
    .eq('status', 'confirmed')
    .single()

  if (!myBooking) return NextResponse.json({ error: '預約不存在' }, { status: 404 })
  if (myBooking.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 取得對方 booking（透過 partner_booking_id）
  const partnerBookingId = myBooking.partner_booking_id
  if (!partnerBookingId) return NextResponse.json({ error: '此課程無夥伴' }, { status: 400 })

  const { data: partnerBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, status')
    .eq('id', partnerBookingId)
    .single()

  if (!partnerBooking) return NextResponse.json({ error: '找不到夥伴預約' }, { status: 404 })

  // 確認新 session 存在
  const { data: newSession } = await supabase
    .from('class_sessions')
    .select('id, enrolled_count, max_students, coach_id, session_date, start_time, course_types(name), coaches(first_name)')
    .eq('id', new_session_id)
    .single()

  if (!newSession) return NextResponse.json({ error: '新時段不存在' }, { status: 404 })

  // 設定雙方 pending_action = 'reschedule'，pending_new_session_id = new_session_id
  await supabase.from('bookings').update({
    pending_action: 'reschedule',
    pending_new_session_id: new_session_id,
  }).eq('id', myBooking.id)

  await supabase.from('bookings').update({
    pending_action: 'reschedule',
    pending_new_session_id: new_session_id,
  }).eq('id', partnerBookingId)

  // 寄 email 通知對方
  try {
    const { data: partnerParent } = await supabase
      .from('parents').select('first_name, email').eq('id', partnerBooking.parent_id).single()
    const { data: myStudent } = await supabase
      .from('students').select('full_name').eq('id', myBooking.student_id).single()
    const { data: partnerStudent } = await supabase
      .from('students').select('full_name').eq('id', partnerBooking.student_id).single()

    if (partnerParent) {
      const ct = Array.isArray((newSession as any).course_types) ? (newSession as any).course_types[0] : (newSession as any).course_types
      const coach = Array.isArray((newSession as any).coaches) ? (newSession as any).coaches[0] : (newSession as any).coaches
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'partner_reschedule_requested',
          to: partnerParent.email,
          parentName: partnerParent.first_name,
          requesterStudentName: myStudent?.full_name || '',
          partnerStudentName: partnerStudent?.full_name || '',
          courseName: ct?.name || '',
          coachName: coach?.first_name || '',
          date: (newSession as any).session_date,
          time: (newSession as any).start_time,
        })
      })
    }
  } catch {}

  return NextResponse.json({ success: true })
}
