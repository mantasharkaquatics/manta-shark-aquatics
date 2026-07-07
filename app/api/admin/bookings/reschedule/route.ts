import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'

function t12(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 || 12
  return hh + ':' + String(m).padStart(2, '0') + ' ' + ap
}

export async function POST(req: NextRequest) {
  const adminCtx = await requireAdmin()
  if (!adminCtx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const svc = adminCtx.svc

  const { booking_id, coach_id, date, time } = await req.json()
  if (!booking_id || !coach_id || !date || !time)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  // Booking to move
  const { data: booking } = await svc
    .from('bookings')
    .select('id, parent_id, student_id, lesson_credit_id, class_session_id, status, is_trial, original_booking_id, partner_booking_id, partnership_id, is_guest')
    .eq('id', booking_id).single()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status !== 'confirmed')
    return NextResponse.json({ error: 'Only confirmed bookings can be rescheduled' }, { status: 400 })
  if (booking.partner_booking_id || booking.partnership_id || booking.is_guest)
    return NextResponse.json({ error: 'Partner bookings must be rescheduled through the partner flow' }, { status: 400 })

  // Old session + course type
  const { data: oldSess } = await svc
    .from('class_sessions')
    .select('id, coach_id, course_type_id, session_date, start_time')
    .eq('id', booking.class_session_id).single()
  if (!oldSess) return NextResponse.json({ error: 'Original session not found' }, { status: 404 })

  const { data: course } = await svc
    .from('course_types')
    .select('id, name, duration_minutes, max_students')
    .eq('id', oldSess.course_type_id).single()
  if (!course) return NextResponse.json({ error: 'Course type not found' }, { status: 500 })

  const [h, m] = time.split(':').map(Number)
  const endMins = h * 60 + m + course.duration_minutes
  const endTime = String(Math.floor(endMins / 60)).padStart(2, '0') + ':' + String(endMins % 60).padStart(2, '0')

  // Find-or-create target session
  const { data: existingSession } = await svc
    .from('class_sessions')
    .select('id, enrolled_count, max_students')
    .eq('coach_id', coach_id)
    .eq('session_date', date)
    .eq('start_time', time)
    .in('status', ['open', 'full'])
    .eq('course_type_id', course.id)
    .maybeSingle()

  let sessId: string
  if (existingSession) {
    if (existingSession.id === oldSess.id)
      return NextResponse.json({ error: 'New time is the same as the current time' }, { status: 400 })
    if (existingSession.enrolled_count >= existingSession.max_students)
      return NextResponse.json({ error: 'This time slot is already full' }, { status: 400 })
    sessId = existingSession.id
  } else {
    const { data: conflicts } = await svc
      .from('class_sessions').select('id')
      .eq('coach_id', coach_id).eq('session_date', date).eq('start_time', time)
      .in('status', ['open', 'full']).gt('enrolled_count', 0)
    if (conflicts && conflicts.length > 0)
      return NextResponse.json({ error: 'The coach already has another lesson at this time' }, { status: 400 })
    const { data: newSess, error: sessErr } = await svc
      .from('class_sessions')
      .insert({
        coach_id,
        course_type_id: course.id,
        session_date: date,
        start_time: time,
        end_time: endTime,
        max_students: course.max_students,
        enrolled_count: 0,
        status: 'open',
      })
      .select('id').single()
    if (sessErr || !newSess)
      return NextResponse.json({ error: 'Failed to create session: ' + (sessErr?.message || 'unknown') }, { status: 500 })
    sessId = newSess.id
  }

  // Insert new booking (credit inherited; counts handled by trg_booking_count)
  const rootOriginalId = booking.original_booking_id || booking.id
  const { data: newBooking, error: bookErr } = await svc
    .from('bookings')
    .insert({
      class_session_id: sessId,
      parent_id: booking.parent_id,
      student_id: booking.student_id,
      lesson_credit_id: booking.lesson_credit_id,
      status: 'confirmed',
      is_trial: booking.is_trial || false,
      original_booking_id: rootOriginalId,
    })
    .select('id').single()
  if (bookErr || !newBooking) {
    const msg = bookErr?.message?.includes('coach_timeslot_conflict')
      ? 'The coach already has another class at this time.'
      : 'Reschedule failed: ' + (bookErr?.message || 'unknown')
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  // Cancel old booking (trigger recounts old session)
  await svc.from('bookings')
    .update({ status: 'cancelled', cancellation_reason: 'rescheduled', pending_new_session_id: sessId })
    .eq('id', booking.id)

  // Notify parent
  try {
    const [{ data: st }, { data: pa }, { data: co }] = await Promise.all([
      svc.from('students').select('full_name').eq('id', booking.student_id).single(),
      svc.from('parents').select('first_name, email').eq('id', booking.parent_id).single(),
      svc.from('coaches').select('first_name, last_name').eq('id', coach_id).single(),
    ])
    if (pa?.email) {
      await sendEmail({
        type: 'booking_rescheduled',
        to: pa.email,
        parentName: pa.first_name,
        studentName: st?.full_name || '',
        courseName: booking.is_trial ? 'Swim Assessment' : course.name,
        coachName: co ? (co.first_name + ' ' + (co.last_name || '')).trim() : '',
        date,
        time: t12(time) + ' – ' + t12(endTime),
      })
    }
  } catch (e) {
    console.error('Reschedule email error:', e)
  }

  return NextResponse.json({ success: true, booking_id: newBooking.id, session_id: sessId })
}
