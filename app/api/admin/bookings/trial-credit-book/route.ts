import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'
import { SCHOOL_CANCEL_REASONS } from '@/lib/trial-booking'
import { assessmentPaymentReversed, reopenReversedAssessment } from '@/lib/assessments'
import { renewalHoldsInWay, renewalHoldRefusal } from '@/lib/bookings/desk-checks'

export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const svc = ctx.svc

  try {
    const { studentId, coachId, date, time, override_holds } = await req.json()
    if (!studentId || !coachId || !date || !time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: student } = await svc
      .from('students')
      .select('id, full_name, parent_id, trial_used_at, current_level')
      .eq('id', studentId)
      .single()
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    if (student.current_level != null) {
      return NextResponse.json({ error: 'This student already has an assigned level and does not need a Swim Assessment' }, { status: 400 })
    }
    // Credit-book path: trial must already be paid (trial_used_at set) with no active trial booking
    if (!student.trial_used_at) {
      return NextResponse.json({ error: 'This student has no paid trial credit' }, { status: 400 })
    }
    const { data: existingTrial } = await svc
      .from('bookings')
      .select('id')
      .eq('student_id', studentId)
      .eq('is_trial', true)
      .neq('status', 'cancelled')
      .limit(1)
    if (existingTrial && existingTrial.length > 0) {
      return NextResponse.json({ error: 'A trial lesson is already booked or awaiting payment for this student' }, { status: 400 })
    }
    // Its payment was refunded in full or charged back: there is no paid
    // assessment to book, and booking one here gave it away free (found
    // 2026-10-08). The family pays again on the site, or the desk sells one.
    if (await assessmentPaymentReversed(svc, studentId)) {
      await reopenReversedAssessment(svc, studentId)
      return NextResponse.json({ error: "This swimmer's Swim Assessment payment was refunded or disputed, so there is no paid assessment to book. The family can pay and book one on the site, or sell one at the front desk." }, { status: 400 })
    }

    const { data: courseType } = await svc
      .from('course_types')
      .select('id, duration_minutes, max_students')
      .eq('slug', '1on1')
      .single()
    if (!courseType) return NextResponse.json({ error: '1-on-1 course type not found' }, { status: 500 })

    const [h, m] = time.split(':').map(Number)
    const endMins = h * 60 + m + courseType.duration_minutes
    const endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`

    const { data: existingSession } = await svc
      .from('class_sessions')
      .select('id, enrolled_count, max_students')
      .eq('coach_id', coachId)
      .eq('session_date', date)
      .eq('start_time', time)
      .in('status', ['open', 'full'])
      .eq('course_type_id', courseType.id)
      .maybeSingle()

    if (!existingSession) {
      const { data: conflicts } = await svc
        .from('class_sessions').select('id')
        .eq('coach_id', coachId).eq('session_date', date).eq('start_time', time)
        .in('status', ['open', 'full']).gt('enrolled_count', 0)
      if (conflicts && conflicts.length > 0)
        return NextResponse.json({ error: 'The coach already has another lesson at this time' }, { status: 400 })
    }

    // A slot held for a fixed-class family's renewal: the assessment takes it
    // only after the desk confirms (override_holds; owner, 2026-10-08). As on
    // the parent's assessment path (lib/assessment-slot), any hold touching
    // the time is the whole slot to a 1-on-1 assessment.
    if (override_holds !== true) {
      const s0 = h * 60 + m
      const hits = await renewalHoldsInWay(svc, {
        coachId, courseTypeId: '', dates: [date], spanStart: s0, spanEnd: s0 + courseType.duration_minutes,
        seatsNeeded: 1, defaultMax: 1, exceptParentIds: [student.parent_id],
      })
      if (hits.size > 0) return NextResponse.json(renewalHoldRefusal(hits), { status: 409 })
    }

    let sessId: string
    if (existingSession) {
      if (existingSession.enrolled_count >= existingSession.max_students) {
        return NextResponse.json({ error: 'This time slot is already full' }, { status: 400 })
      }
      sessId = existingSession.id
    } else {
      const { data: newSess, error: sessErr } = await svc
        .from('class_sessions')
        .insert({
          coach_id: coachId,
          course_type_id: courseType.id,
          session_date: date,
          start_time: time,
          end_time: endTime,
          max_students: courseType.max_students,
          enrolled_count: 0,
          status: 'open',
        })
        .select()
        .single()
      if (sessErr || !newSess) {
        return NextResponse.json({ error: 'Failed to create session: ' + (sessErr?.message || 'unknown error') }, { status: 500 })
      }
      sessId = newSess.id
    }

    // Find an unused assessment credit (POS-sold start at 0; legacy webhook credits are pre-consumed)
    const { data: trialCredits } = await svc
      .from('lesson_credits')
      .select('id')
      .eq('student_id', studentId)
      .eq('is_trial', true)
      .eq('used_credits', 0)
      .limit(1)
    const trialCreditId = trialCredits && trialCredits.length > 0 ? trialCredits[0].id : null
    // No unused credit: the assessment may be one the school cancelled after
    // it was paid (owner, 2026-10-06). Its credit is already marked used, by
    // that booking; the new booking takes it over, so the invoice and the
    // payment stay attached to the lesson that is actually given.
    let carriedCreditId: string | null = null
    if (!trialCreditId) {
      const { data: prev } = await svc
        .from('bookings').select('lesson_credit_id')
        .eq('student_id', studentId).eq('is_trial', true).eq('status', 'cancelled')
        .in('cancellation_reason', SCHOOL_CANCEL_REASONS as unknown as string[])
        .not('lesson_credit_id', 'is', null)
        .order('cancelled_at', { ascending: false }).limit(1)
      carriedCreditId = prev && prev[0] ? prev[0].lesson_credit_id : null
    }

    const { error: bookErr } = await svc
      .from('bookings')
      .insert({
        class_session_id: sessId,
        parent_id: student.parent_id,
        student_id: studentId,
        lesson_credit_id: trialCreditId || carriedCreditId,
        is_trial: true,
        status: 'confirmed',
      })
    if (bookErr) {
      if (bookErr.message?.includes('coach_timeslot_conflict')) {
        return NextResponse.json({ error: 'The coach already has another lesson at this time' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create booking: ' + bookErr.message }, { status: 500 })
    }

    if (trialCreditId) {
      await svc.from('lesson_credits').update({ used_credits: 1 }).eq('id', trialCreditId)
    }

    // Confirmation email (non-fatal)
    try {
      const { data: parent } = await svc.from('parents').select('first_name, email').eq('id', student.parent_id).single()
      const { data: coach } = await svc.from('coaches').select('first_name, last_name').eq('id', coachId).single()
      if (parent?.email) {
        await sendEmail({
          type: 'booking_confirmed',
          to: parent.email,
          parentName: parent.first_name || 'there',
          studentName: student.full_name,
          courseName: 'Swim Assessment',
          coachName: coach ? `${coach.first_name} ${coach.last_name}` : '',
          date,
          time: `${formatTime12h(time)} – ${formatTime12h(endTime)}`,
        })
      }
    } catch (e) {
      console.error('Trial credit-book email error:', e)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}
