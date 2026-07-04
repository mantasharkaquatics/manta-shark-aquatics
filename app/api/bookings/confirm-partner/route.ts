import { sendEmail } from '@/lib/email'
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

  if (!partnerBooking) return NextResponse.json({ error: 'Invitation not found or already expired' }, { status: 404 })
  if (partnerBooking.parent_id !== confirmingParent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (new Date(partnerBooking.pending_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 })
  }

  const initiatorBookingId = partnerBooking.partner_booking_id
  if (!initiatorBookingId) return NextResponse.json({ error: 'Initiator booking not found' }, { status: 404 })

  const { data: initiatorBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id')
    .eq('id', initiatorBookingId)
    .eq('status', 'pending_partner')
    .single()

  if (!initiatorBooking) return NextResponse.json({ error: 'Initiator booking not found' }, { status: 404 })

  const { data: session } = await supabase
    .from('class_sessions')
    .select('id, enrolled_count, max_students, course_type_id, coach_id, session_date, start_time')
    .eq('id', partnerBooking.class_session_id)
    .single()

  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // 檢查同教練同時段是否已有其他 confirmed booking（其他客戶搶先預約）
  const { data: conflictSessions } = await supabase
    .from('class_sessions')
    .select('id')
    .eq('coach_id', session.coach_id)
    .eq('session_date', session.session_date)
    .eq('start_time', session.start_time)
    .neq('id', session.id)
  const conflictSessionIds = (conflictSessions || []).map((s: any) => s.id)
  if (conflictSessionIds.length > 0) {
    const { data: conflictBookings } = await supabase
      .from('bookings')
      .select('id')
      .in('class_session_id', conflictSessionIds)
      .not('status', 'in', '("cancelled","pending_partner")')
    if (conflictBookings && conflictBookings.length > 0) {
      await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', partnerBooking.id)
      await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', initiatorBookingId)
      return NextResponse.json({ error: 'This time slot was taken by another customer and cannot be confirmed.' }, { status: 409 })
    }
  }

  if (session.enrolled_count + 2 > session.max_students) {
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', partnerBooking.id)
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', initiatorBookingId)
    return NextResponse.json({ error: 'This time slot is full and cannot be confirmed.' }, { status: 409 })
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

  if (!partnerCredit) return NextResponse.json({ error: 'You do not have enough credits.' }, { status: 402 })
  if (!initiatorCredit) return NextResponse.json({ error: 'The inviting family does not have enough credits.' }, { status: 402 })

  const { data: claimRows } = await supabase.from('bookings').update({
    status: 'confirmed',
    lesson_credit_id: partnerCredit.id,
    pending_action: null,
    pending_expires_at: null,
    partner_booking_id: initiatorBookingId,
  }).eq('id', partnerBooking.id).eq('status', 'pending_partner').select('id')
  if (!claimRows || claimRows.length === 0) {
    return NextResponse.json({ error: 'This invitation was already processed.' }, { status: 409 })
  }

  await supabase.from('bookings').update({
    status: 'confirmed',
    lesson_credit_id: initiatorCredit.id,
    pending_action: null,
    pending_expires_at: null,
    partner_booking_id: partnerBooking.id,
  }).eq('id', initiatorBookingId)

  await supabase.rpc('increment_used_credits', { credit_id: partnerCredit.id })
  await supabase.rpc('increment_used_credits', { credit_id: initiatorCredit.id })

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
      await sendEmail({
          type: 'partner_booking_confirmed',
          to: initiatorParent.email,
          parentName: initiatorParent.first_name,
          studentName: partnerStudent?.full_name || '',
          courseName: ct?.name || '',
          coachName: coach?.first_name || '',
          date: (sess as any).session_date,
          time: (sess as any).start_time,
        })
    }
  } catch {}

  return NextResponse.json({ success: true })
}
