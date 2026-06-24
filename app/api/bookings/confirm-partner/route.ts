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

  const { partner_booking_id } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: confirmingParent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!confirmingParent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: partnerBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, partner_booking_id, pending_expires_at')
    .eq('id', partner_booking_id)
    .eq('status', 'pending_partner')
    .eq('pending_action', 'confirm')
    .single()

  if (!partnerBooking) return NextResponse.json({ error: '預約不存在或已過期' }, { status: 404 })
  if (partnerBooking.parent_id !== confirmingParent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (new Date(partnerBooking.pending_expires_at) < new Date()) {
    return NextResponse.json({ error: '邀請已過期' }, { status: 410 })
  }

  const initiatorBookingId = partnerBooking.partner_booking_id
  if (!initiatorBookingId) return NextResponse.json({ error: '找不到發起方預約' }, { status: 404 })

  const { data: initiatorBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id')
    .eq('id', initiatorBookingId)
    .eq('status', 'pending_partner')
    .single()

  if (!initiatorBooking) return NextResponse.json({ error: '發起方預約不存在' }, { status: 404 })

  const { data: session } = await supabase
    .from('class_sessions')
    .select('id, enrolled_count, max_students, course_type_id')
    .eq('id', partnerBooking.class_session_id)
    .single()

  if (!session) return NextResponse.json({ error: '課程不存在' }, { status: 404 })
  if (session.enrolled_count + 2 > session.max_students) {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', partnerBooking.id)
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', initiatorBookingId)
    return NextResponse.json({ error: '此時段已被預約，無法確認' }, { status: 409 })
  }

  const courseTypeId = session.course_type_id

  const { data: partnerCredits } = await supabase
    .from('lesson_credits').select('id, total_credits, used_credits, course_type_id')
    .eq('parent_id', confirmingParent.id)

  const { data: initiatorCredits } = await supabase
    .from('lesson_credits').select('id, total_credits, used_credits, course_type_id')
    .eq('parent_id', initiatorBooking.parent_id)

  const partnerCredit = (partnerCredits || [])
    .filter(c => c.course_type_id === courseTypeId && (c.total_credits - c.used_credits) > 0)
    .sort((a, b) => a.id.localeCompare(b.id))[0] || null

  const initiatorCredit = (initiatorCredits || [])
    .filter(c => c.course_type_id === courseTypeId && (c.total_credits - c.used_credits) > 0)
    .sort((a, b) => a.id.localeCompare(b.id))[0] || null

  if (!partnerCredit) return NextResponse.json({ error: '您沒有足夠的 credit' }, { status: 402 })
  if (!initiatorCredit) return NextResponse.json({ error: '發起方沒有足夠的 credit' }, { status: 402 })

  await supabase.from('bookings').update({
    status: 'confirmed',
    lesson_credit_id: partnerCredit.id,
    pending_action: null,
    pending_expires_at: null,
  }).eq('id', partnerBooking.id)

  await supabase.from('bookings').update({
    status: 'confirmed',
    lesson_credit_id: initiatorCredit.id,
    pending_action: null,
    pending_expires_at: null,
  }).eq('id', initiatorBookingId)

  await supabase.from('lesson_credits').update({ used_credits: partnerCredit.used_credits + 1 }).eq('id', partnerCredit.id)
  await supabase.from('lesson_credits').update({ used_credits: initiatorCredit.used_credits + 1 }).eq('id', initiatorCredit.id)
  await supabase.rpc('increment_enrolled', { session_id: partnerBooking.class_session_id })
  await supabase.rpc('increment_enrolled', { session_id: partnerBooking.class_session_id })

  try {
    const { data: initiatorParent } = await supabase.from('parents').select('first_name, email').eq('id', initiatorBooking.parent_id).single()
    const { data: partnerStudent } = await supabase.from('students').select('full_name').eq('id', partnerBooking.student_id).single()
    const { data: sess } = await supabase
      .from('class_sessions')
      .select('session_date, start_time, course_types(name), coaches(first_name)')
      .eq('id', partnerBooking.class_session_id)
      .single()
    if (initiatorParent && sess) {
      const ct = Array.isArray((sess as any).course_types) ? (sess as any).course_types[0] : (sess as any).course_types
      const coach = Array.isArray((sess as any).coaches) ? (sess as any).coaches[0] : (sess as any).coaches
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'partner_booking_confirmed',
          to: initiatorParent.email,
          parentName: initiatorParent.first_name,
          studentName: partnerStudent?.full_name || '',
          courseName: ct?.name || '',
          coachName: coach?.first_name || '',
          date: (sess as any).session_date,
          time: (sess as any).start_time,
        })
      })
    }
  } catch {}

  return NextResponse.json({ success: true })
}
