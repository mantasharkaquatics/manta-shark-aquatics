import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { getCoachBlocks, isBlocked } from '@/lib/availability'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'

// Parent books a Swim Assessment using a prepaid credit (e.g. purchased at the front desk POS).
export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const svc = ctx.svc

  try {
    const { studentId, coachId, date, time } = await req.json()
    if (!studentId || !coachId || !date || !time) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: student } = await svc
      .from('students')
      .select('id, full_name, parent_id, trial_used_at, current_level')
      .eq('id', studentId)
      .eq('parent_id', ctx.parent.id)
      .single()
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    if (student.current_level != null) {
      return NextResponse.json({ error: 'This student already has an assigned level and does not need a Swim Assessment' }, { status: 400 })
    }
    const { data: existingTrial } = await svc
      .from('bookings')
      .select('id')
      .eq('student_id', studentId)
      .eq('is_trial', true)
      .neq('status', 'cancelled')
      .limit(1)
    if (existingTrial && existingTrial.length > 0) {
      return NextResponse.json({ error: 'A Swim Assessment is already booked for this student' }, { status: 400 })
    }

    // Claim the credit first (conditional update = lock); refund if booking fails
    const { data: claimed } = await svc
      .from('lesson_credits')
      .update({ used_credits: 1 })
      .eq('student_id', studentId)
      .eq('is_trial', true)
      .eq('used_credits', 0)
      .select('id')
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'No available assessment credit for this student' }, { status: 400 })
    }
    const trialCreditId = claimed[0].id
    const refund = async () => {
      await svc.from('lesson_credits').update({ used_credits: 0 }).eq('id', trialCreditId)
    }

    const { data: courseType } = await svc
      .from('course_types')
      .select('id, duration_minutes, max_students')
      .eq('slug', '1on1')
      .single()
    if (!courseType) { await refund(); return NextResponse.json({ error: 'Course type not found' }, { status: 500 }) }

    const [h, m] = time.split(':').map(Number)
    const endMins = h * 60 + m + courseType.duration_minutes
    const endTime = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`

    const coachBlocks = await getCoachBlocks(svc, [coachId], date)
    if (isBlocked(coachBlocks, coachId, time, endTime)) {
      await refund()
      return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 400 })
    }

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
      if (conflicts && conflicts.length > 0) {
        await refund()
        return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 400 })
      }
    }

    let sessId: string
    if (existingSession) {
      if (existingSession.enrolled_count >= existingSession.max_students) {
        await refund()
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
        await refund()
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
      }
      sessId = newSess.id
    }

    const { error: bookErr } = await svc
      .from('bookings')
      .insert({
        class_session_id: sessId,
        parent_id: ctx.parent.id,
        student_id: studentId,
        lesson_credit_id: trialCreditId,
        is_trial: true,
        status: 'confirmed',
      })
    if (bookErr) {
      await refund()
      if (bookErr.message?.includes('coach_timeslot_conflict')) {
        return NextResponse.json({ error: 'This time slot is no longer available' }, { status: 409 })
      }
      return NextResponse.json({ error: 'Failed to create booking: ' + bookErr.message }, { status: 500 })
    }

    // Confirmation email (non-fatal)
    try {
      const { data: parent } = await svc.from('parents').select('first_name, email').eq('id', ctx.parent.id).single()
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
      console.error('Parent trial credit-book email error:', e)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Internal error' }, { status: 500 })
  }
}
