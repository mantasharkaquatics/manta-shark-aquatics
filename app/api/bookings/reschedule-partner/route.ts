import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readJson, badRequest } from '@/lib/http'
import { getTodayLA, getNowMinutesLA, minutesUntil, formatTime12h } from '@/lib/date'
import { LEAD_TIME_MINUTES, singleMaxDate, SINGLE_TOO_FAR_ERROR, FIXED_NO_RESCHEDULE_ERROR } from '@/lib/booking-time'
import { sessionsHeldByInvites } from '@/lib/bookings/invite-holds'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (!body) return badRequest()
  const { booking_id, new_session_id } = body

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch the initiator's booking
  const { data: myBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, partner_booking_id, status, lesson_group_id, fixed_class_id, voucher_id')
    .eq('id', booking_id)
    .eq('status', 'confirmed')
    .single()

  if (!myBooking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (myBooking.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  // This route used to take any session id the client sent and check only
  // that it existed (found 2026-10-03). The rules a move has to keep:
  // not a fixed-class or make-up lesson, not a 60-minute lesson (two
  // linked halves -- moving one splits it), not inside 24 hours, and into
  // the same kind of lesson, on a bookable date, with room for both.
  if (myBooking.fixed_class_id || myBooking.voucher_id)
    return NextResponse.json({ error: FIXED_NO_RESCHEDULE_ERROR }, { status: 400 })
  if (myBooking.lesson_group_id)
    return NextResponse.json({ error: 'This lesson cannot be moved online. Please contact us and we will move it for you.' }, { status: 400 })
  const today = getTodayLA(), nowMin = getNowMinutesLA()
  const { data: oldSess } = await supabase.from('class_sessions')
    .select('id, session_date, start_time, end_time, course_type_id').eq('id', myBooking.class_session_id).single()
  if (!oldSess) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (minutesUntil(oldSess.session_date, String(oldSess.start_time).slice(0, 5), today, nowMin) < 24 * 60)
    return NextResponse.json({ error: 'Bookings within 24 hours cannot be rescheduled online. Please contact us.' }, { status: 400 })

  // Fetch the partner's booking (via partner_booking_id)
  const partnerBookingId = myBooking.partner_booking_id
  if (!partnerBookingId) return NextResponse.json({ error: 'This lesson has no partner' }, { status: 400 })

  const { data: partnerBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, status')
    .eq('id', partnerBookingId)
    .single()

  if (!partnerBooking) return NextResponse.json({ error: 'Partner booking not found' }, { status: 404 })
  // Their half has to still exist. Asking a family to confirm a move for a
  // lesson they already cancelled puts a button on their dashboard that cannot
  // do anything, and leaves this side pending until it expires.
  if (partnerBooking.status !== 'confirmed')
    return NextResponse.json({ error: 'The other family is no longer booked into this lesson, so it cannot be moved. Please cancel and book again.' }, { status: 409 })

  // Verify the new session exists
  const { data: newSession } = await supabase
    .from('class_sessions')
    .select('id, enrolled_count, max_students, coach_id, session_date, start_time, end_time, course_type_id, status, course_types(name), coaches(first_name)')
    .eq('id', new_session_id)
    .single()

  if (!newSession) return NextResponse.json({ error: 'New time slot not found' }, { status: 404 })
  const ns: any = newSession
  if (ns.id === oldSess.id || ns.status === 'cancelled' || ns.course_type_id !== oldSess.course_type_id)
    return NextResponse.json({ error: 'A lesson can only be moved to the same kind of lesson. Please cancel and book again instead.' }, { status: 400 })
  const nStart = String(ns.start_time).slice(0, 5)
  if (ns.session_date < today || minutesUntil(ns.session_date, nStart, today, nowMin) < LEAD_TIME_MINUTES)
    return NextResponse.json({ error: 'Bookings must be made at least 30 minutes before the lesson starts. Please pick a later time.' }, { status: 400 })
  if (ns.session_date > singleMaxDate(today))
    return NextResponse.json({ error: SINGLE_TOO_FAR_ERROR }, { status: 400 })
  if ((ns.enrolled_count ?? 0) + 2 > ns.max_students
      || (await sessionsHeldByInvites(supabase as any, [ns.id])).has(ns.id))
    return NextResponse.json({ error: 'This time slot is full. Please pick another time.' }, { status: 409 })

  // Set both sides' pending_action = 'reschedule', pending_new_session_id = new_session_id
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  // Initiator: reschedule_initiator (no confirm button shown)
  await supabase.from('bookings').update({
    pending_action: 'reschedule_initiator',
    pending_new_session_id: new_session_id,
    pending_expires_at: expiresAt,
  }).eq('id', myBooking.id)

  // Partner: reschedule (confirm/reject buttons shown)
  await supabase.from('bookings').update({
    pending_action: 'reschedule',
    pending_new_session_id: new_session_id,
    pending_expires_at: expiresAt,
  }).eq('id', partnerBookingId)

  // Email the partner
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
      // The current time, the proposed one and the deadline (found
      // 2026-10-07): the template showed none of them, and the raw column
      // ("10:20:00") was passed as the time. date/time are the lesson as it
      // stands; newDate/newTime what is being asked for.
      const range = (st: any, en: any) => formatTime12h(String(st)) + (en ? ' \u2013 ' + formatTime12h(String(en)) : '')
      await sendEmail({
          type: 'partner_reschedule_requested',
          to: partnerParent.email,
          parentName: partnerParent.first_name,
          requesterStudentName: myStudent?.full_name || '',
          partnerStudentName: partnerStudent?.full_name || '',
          courseName: ct?.name || '',
          coachName: coach?.first_name || '',
          date: oldSess.session_date,
          time: range(oldSess.start_time, (oldSess as any).end_time),
          newDate: ns.session_date,
          newTime: range(ns.start_time, ns.end_time),
          deadline: new Date(expiresAt).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' }),
        })
    }
  } catch {}

  return NextResponse.json({ success: true })
}
