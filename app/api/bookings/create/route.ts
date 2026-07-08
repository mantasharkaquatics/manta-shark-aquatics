import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { getCoachBlocks, isBlocked } from '@/lib/availability'
import { getTodayLA, getNowMinutesLA, formatDateLA, formatTime12h } from '@/lib/date'
import { sendEmail } from '@/lib/email'

function minutesUntil(dateStr: string, timeStr: string, todayStr: string, nowMin: number) {
  const d = (s: string) => Date.parse(s + 'T00:00:00Z')
  const days = Math.round((d(dateStr) - d(todayStr)) / 86400000)
  const [h, m] = timeStr.split(':').map(Number)
  return days * 1440 + h * 60 + m - nowMin
}

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const {
    course_type_id, coach_id, session_date, start_time,
    student_id, student2_id, partner,
    reschedule_booking_id, partner_reschedule,
  } = body

  if (!course_type_id || !coach_id || !session_date || !start_time)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  if (!partner_reschedule && !student_id)
    return NextResponse.json({ error: 'Missing student' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(session_date) || !/^\d{2}:\d{2}$/.test(start_time))
    return NextResponse.json({ error: 'Invalid date or time format' }, { status: 400 })

  // Date & cutoff checks (LA time)
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  if (session_date < today || (session_date === today && minutesUntil(session_date, start_time, today, nowMin) <= 0))
    return NextResponse.json({ error: 'This time has already passed. Please pick another time.' }, { status: 400 })
  const maxDate = formatDateLA(new Date(Date.now() + 60 * 86400000))
  if (session_date > maxDate)
    return NextResponse.json({ error: 'Bookings can only be made up to 60 days in advance.' }, { status: 400 })
  const tomorrow = formatDateLA(new Date(Date.now() + 86400000))
  if (session_date === tomorrow && nowMin >= 19 * 60 + 30)
    return NextResponse.json({ error: 'Next-day bookings after 7:30 PM must be made through us. Please contact us and we will reserve your spot.' }, { status: 400 })

  // Course type & coach
  const { data: course } = await svc
    .from('course_types')
    .select('id, name, slug, duration_minutes, max_students')
    .eq('id', course_type_id).single()
  if (!course) return NextResponse.json({ error: 'Course type not found' }, { status: 400 })
  const { data: coach } = await svc
    .from('coaches').select('id, first_name, last_name').eq('id', coach_id).single()
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 400 })

  const [h, m] = start_time.split(':').map(Number)
  const endTotal = h * 60 + m + course.duration_minutes
  const end_time = String(Math.floor(endTotal / 60)).padStart(2, '0') + ':' + String(endTotal % 60).padStart(2, '0')

  // Coach block check (time_off / admin_block)
  const coachBlocks = await getCoachBlocks(svc, [coach_id], session_date)
  if (isBlocked(coachBlocks, coach_id, start_time, end_time))
    return NextResponse.json({ error: 'The coach is not available at this time. Please pick another time.' }, { status: 409 })

  // Coach conflict check (any course type, enrolled > 0)
  const { data: conflicts } = await svc
    .from('class_sessions')
    .select('id, course_type_id, enrolled_count, max_students')
    .eq('coach_id', coach_id)
    .eq('session_date', session_date)
    .eq('start_time', start_time)
    .eq('status', 'open')
    .gt('enrolled_count', 0)
  const sameCourseSession = (conflicts || []).find((c: any) => c.course_type_id === course_type_id)
  if ((conflicts || []).some((c: any) => c.course_type_id !== course_type_id))
    return NextResponse.json({ error: 'The coach already has another class at this time. Please pick another time.' }, { status: 409 })
  if (sameCourseSession && sameCourseSession.enrolled_count >= sameCourseSession.max_students)
    return NextResponse.json({ error: 'This time slot is full. Please pick another time.' }, { status: 409 })

  // Find or create session
  let sessionId: string | null = sameCourseSession?.id || null
  if (!sessionId) {
    const { data: openSessions } = await svc
      .from('class_sessions')
      .select('id, enrolled_count, max_students')
      .eq('coach_id', coach_id)
      .eq('session_date', session_date)
      .eq('start_time', start_time)
      .eq('course_type_id', course_type_id)
      .eq('status', 'open')
      .limit(1)
    const found = openSessions?.[0]
    if (found) {
      if (found.enrolled_count >= found.max_students)
        return NextResponse.json({ error: 'This time slot is full. Please pick another time.' }, { status: 409 })
      sessionId = found.id
    }
  }
  if (!sessionId) {
    const { data: created, error: sessErr } = await svc
      .from('class_sessions')
      .insert({
        course_type_id, coach_id, session_date, start_time, end_time,
        max_students: course.max_students, enrolled_count: 0, status: 'open',
      })
      .select('id').single()
    if (sessErr || !created)
      return NextResponse.json({ error: 'Could not create the time slot. Please try again.' }, { status: 500 })
    sessionId = created.id
  }

  // Partner-reschedule mode: only resolve the session, client then calls reschedule-partner
  if (partner_reschedule) return NextResponse.json({ session_id: sessionId })

  // Student ownership
  const { data: student } = await svc
    .from('students').select('id, full_name, parent_id, current_level').eq('id', student_id).single()
  if (!student || student.parent_id !== parent.id)
    return NextResponse.json({ error: 'Student not found' }, { status: 403 })
  if (student.current_level == null)
    return NextResponse.json({ error: 'This student must complete a Swim Assessment before booking lessons. Please book a Swim Assessment first.' }, { status: 403 })
  let student2: any = null
  if (student2_id) {
    const { data: s2 } = await svc
      .from('students').select('id, parent_id, current_level').eq('id', student2_id).single()
    if (!s2 || s2.parent_id !== parent.id)
      return NextResponse.json({ error: 'Second student not found' }, { status: 403 })
    if (s2.current_level == null)
      return NextResponse.json({ error: 'The second student must complete a Swim Assessment before booking lessons.' }, { status: 403 })
    student2 = s2
  }

  const isPartnerBooking = course.slug === '1on2' && !!partner

  // Reschedule validation (ownership + 24-hour rule, server-enforced)
  let oldBooking: any = null
  if (reschedule_booking_id) {
    const { data: ob } = await svc
      .from('bookings')
      .select('id, parent_id, status, lesson_credit_id, class_session_id, original_booking_id')
      .eq('id', reschedule_booking_id).single()
    if (!ob || ob.parent_id !== parent.id)
      return NextResponse.json({ error: 'Booking to reschedule not found' }, { status: 403 })
    if (ob.status !== 'confirmed')
      return NextResponse.json({ error: 'Only confirmed bookings can be rescheduled' }, { status: 400 })
    const { data: oldSess } = await svc
      .from('class_sessions').select('session_date, start_time').eq('id', ob.class_session_id).single()
    if (oldSess && minutesUntil(oldSess.session_date, oldSess.start_time, today, nowMin) < 24 * 60)
      return NextResponse.json({ error: 'Bookings within 24 hours cannot be rescheduled online. Please contact us.' }, { status: 400 })
    oldBooking = ob
  }

  // Credits (server-side resolution, oldest first)
  const { data: creditRows } = await svc
    .from('lesson_credits')
    .select('id, total_credits, used_credits, created_at')
    .eq('parent_id', parent.id)
    .eq('course_type_id', course_type_id)
    .order('created_at', { ascending: true })
  const rows = (creditRows || []).map((c: any) => ({ ...c, remaining: c.total_credits - c.used_credits }))
  const totalRemaining = rows.reduce((s: number, c: any) => s + c.remaining, 0)

  const inheritCredit = !!oldBooking && !isPartnerBooking && !!oldBooking.lesson_credit_id
  let credit: any = null
  let credit2: any = null
  if (isPartnerBooking) {
    if (totalRemaining < 1)
      return NextResponse.json({ error: 'No remaining credits for this course type.' }, { status: 400 })
  } else if (!inheritCredit) {
    credit = rows.find((c: any) => c.remaining > 0) || null
    if (!credit)
      return NextResponse.json({ error: 'No remaining credits for this course type.' }, { status: 400 })
  }
  if (student2 && !isPartnerBooking) {
    credit2 = rows.find((c: any) => (c.remaining - (credit && c.id === credit.id ? 1 : 0)) > 0) || null
    if (!credit2)
      return NextResponse.json({ error: 'Not enough credits for two students.' }, { status: 400 })
  }

  const rootOriginalId = oldBooking ? (oldBooking.original_booking_id || oldBooking.id) : null

  // Insert initiator booking
  const { data: newBooking, error: bookErr } = await svc
    .from('bookings')
    .insert({
      class_session_id: sessionId,
      parent_id: parent.id,
      lesson_credit_id: isPartnerBooking ? null : (inheritCredit ? oldBooking.lesson_credit_id : credit.id),
      student_id: student.id,
      status: isPartnerBooking ? 'pending_partner' : 'confirmed',
      pending_action: null,
      pending_expires_at: isPartnerBooking ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
      original_booking_id: rootOriginalId,
    })
    .select('id').single()
  if (bookErr || !newBooking) {
    const msg = bookErr?.message?.includes('coach_timeslot_conflict')
      ? 'The coach already has another class at this time. Please pick another time.'
      : 'Booking failed. Please try again.'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  if (!isPartnerBooking) {
    if (!inheritCredit)
      await svc.from('lesson_credits').update({ used_credits: credit.used_credits + 1 }).eq('id', credit.id)
  }

  // Second student (same account)
  if (student2 && credit2) {
    const bump = credit && credit2.id === credit.id ? 1 : 0
    const { error: s2Err } = await svc.from('bookings').insert({
      class_session_id: sessionId,
      parent_id: parent.id,
      lesson_credit_id: credit2.id,
      student_id: student2.id,
      status: 'confirmed',
      original_booking_id: rootOriginalId,
    })
    if (!s2Err) {
      await svc.from('lesson_credits').update({ used_credits: credit2.used_credits + bump + 1 }).eq('id', credit2.id)
    }
  }

  const { data: parentRow } = await svc
    .from('parents').select('first_name, last_name, email').eq('id', parent.id).single()

  // Cross-account partner pending booking (replaces create-partner-pending)
  let partnerBookingId: string | null = null
  if (isPartnerBooking && partner) {
    const { data: pStudent } = await svc
      .from('students').select('id, parent_id, full_name, current_level').eq('id', partner.student_id).single()
    if (!pStudent || pStudent.parent_id !== partner.parent_id) {
      await svc.from('bookings').update({ status: 'cancelled', cancellation_reason: 'partner_invalid' }).eq('id', newBooking.id)
      return NextResponse.json({ error: 'Partner student not found' }, { status: 400 })
    }
    if (pStudent.current_level == null) {
      await svc.from('bookings').update({ status: 'cancelled', cancellation_reason: 'partner_needs_assessment' }).eq('id', newBooking.id)
      return NextResponse.json({ error: 'The partner student must complete a Swim Assessment before booking lessons.' }, { status: 400 })
    }
    const expiry = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const { data: guest, error: guestErr } = await svc.from('bookings').insert({
      class_session_id: sessionId,
      parent_id: partner.parent_id,
      lesson_credit_id: null,
      student_id: partner.student_id,
      status: 'pending_partner',
      pending_action: 'confirm',
      pending_expires_at: expiry,
      partner_parent_id: parent.id,
      partner_booking_id: newBooking.id,
      partnership_id: partner.partnership_id || null,
      is_guest: true,
    }).select('id').single()
    if (guestErr || !guest) {
      await svc.from('bookings').update({ status: 'cancelled', cancellation_reason: 'partner_invalid' }).eq('id', newBooking.id)
      return NextResponse.json({ error: 'Could not create partner invitation. Please try again.' }, { status: 500 })
    }
    partnerBookingId = guest.id
    await svc.from('bookings').update({ pending_expires_at: expiry }).eq('id', newBooking.id)
    try {
      const { data: pp } = await svc.from('parents').select('first_name, email').eq('id', partner.parent_id).single()
      if (pp) {
        await sendEmail({
            type: 'partner_booking_invite',
            to: pp.email,
            parentName: pp.first_name,
            studentName: pStudent.full_name,
            inviterName: ((parentRow?.first_name || '') + ' ' + (parentRow?.last_name || '')).trim(),
            courseName: course.name,
            coachName: coach.first_name,
            date: session_date,
            time: formatTime12h(start_time),
          })
      }
    } catch {}
  }

  // Finalize reschedule: cancel old booking
  if (oldBooking) {
    await svc.from('bookings')
      .update({ status: 'cancelled', cancellation_reason: 'rescheduled', pending_new_session_id: sessionId })
      .eq('id', oldBooking.id)
    if (isPartnerBooking && oldBooking.lesson_credit_id) {
      await svc.rpc('decrement_used_credits', { credit_id: oldBooking.lesson_credit_id })
    }
  }

  // Confirmation email (skipped for pending partner bookings)
  if (!isPartnerBooking) {
    try {
      if (parentRow?.email) {
        await sendEmail({
            type: oldBooking ? 'booking_rescheduled' : 'booking_confirmed',
            to: parentRow.email,
            parentName: parentRow.first_name,
            studentName: student.full_name,
            courseName: course.name,
            coachName: (coach.first_name + ' ' + (coach.last_name || '')).trim(),
            date: session_date,
            time: formatTime12h(start_time) + ' – ' + formatTime12h(end_time),
          })
      }
    } catch {}
  }

  return NextResponse.json({ success: true, booking_id: newBooking.id, partner_booking_id: partnerBookingId })
}
