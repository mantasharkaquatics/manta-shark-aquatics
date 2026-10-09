import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { readJson, badRequest } from '@/lib/http'
import { getTodayLA, getNowMinutesLA } from '@/lib/date'
import { inviteHeldSessions } from '@/lib/bookings/invite-holds'
import { coachBlocksOn, overlapsAny, studentLessonsOn, renewalHoldsInWay, renewalHoldRefusal } from '@/lib/bookings/desk-checks'
import { sessionLocationLine } from '@/lib/locations'

function t12(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap
}

export async function POST(req: NextRequest) {
  const adminCtx = await requireAdmin()
  if (!adminCtx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const svc = adminCtx.svc

  const body = await readJson(req)
  if (!body) return badRequest()
  const { session_id, coach_id, date, time } = body
  if (!session_id || !coach_id || !date || !time)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const { data: sess } = await svc
    .from('class_sessions')
    .select('id, coach_id, course_type_id, session_date, start_time, status, max_students')
    .eq('id', session_id).single()
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (sess.coach_id === coach_id && sess.session_date === date && sess.start_time.slice(0, 5) === time.slice(0, 5))
    return NextResponse.json({ error: 'New time is the same as the current time' }, { status: 400 })

  // Movable: confirmed or pending_payment (webhook reads session time from DB at payment
  // completion, and session UPDATE keeps booking/session ids intact, so Stripe flow is unaffected)
  const { data: activeBookings } = await svc
    .from('bookings')
    .select('id, parent_id, student_id, status, is_trial, lesson_group_id')
    .eq('class_session_id', session_id)
    // pending_partner used to be filtered out here, so a 1-on-2 invitation
    // waiting on the partner was moved silently and the partner never told.
    // Keeping it in lets the "pending confirmation" refusal below fire (found 2026-10-04).
    .neq('status', 'cancelled')
  if (!activeBookings || activeBookings.length === 0)
    return NextResponse.json({ error: 'No active bookings on this session' }, { status: 400 })
  if (activeBookings.some((b: any) => b.status !== 'confirmed' && b.status !== 'pending_payment'))
    return NextResponse.json({ error: 'Session has bookings in cart or pending confirmation and cannot be moved' }, { status: 400 })

  // A 60-minute lesson is two linked bookings living in two different sessions.
  // Moving one half alone tears the hour in two, so the whole group travels:
  // the halves are re-laid contiguously from the drop target and a relay group
  // collapses onto the target coach (manual moves are an explicit assignment).
  const groupId = (activeBookings as any[]).map(b => b.lesson_group_id).find(Boolean) || null
  let moveSessionIds: string[] = [session_id]
  if (groupId) {
    const { data: sibs } = await svc
      .from('bookings').select('class_session_id')
      .eq('lesson_group_id', groupId).neq('status', 'cancelled')
    const ids = Array.from(new Set((sibs || []).map((b: any) => b.class_session_id).filter(Boolean)))
    if (ids.length > 1) {
      const { data: gs } = await svc
        .from('class_sessions').select('id, start_time').in('id', ids).neq('status', 'cancelled')
      moveSessionIds = (gs || [])
        .sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)))
        .map((x: any) => x.id)
    }
  }

  // Same guards as cancel-session: a lesson that has ended, or where a swimmer
  // checked in, was delivered and stays where it happened. And a lesson cannot
  // be moved into the past (found 2026-10-04).
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  const hm = (t: string) => { const [hh, mm] = String(t).slice(0, 5).split(':').map(Number); return hh * 60 + mm }
  if (date < today || (date === today && hm(time) <= nowMin))
    return NextResponse.json({ error: 'A lesson cannot be moved to a time that has already passed' }, { status: 400 })
  const { data: movingSess } = await svc
    .from('class_sessions').select('id, session_date, end_time').in('id', moveSessionIds)
  if ((movingSess || []).some((x: any) => x.session_date < today || (x.session_date === today && x.end_time && hm(x.end_time) <= nowMin)))
    return NextResponse.json({ error: 'This lesson has already taken place and cannot be moved.' }, { status: 409 })
  const { data: movingBookings } = await svc
    .from('bookings').select('id').in('class_session_id', moveSessionIds).neq('status', 'cancelled')
  const { data: attended } = (movingBookings || []).length
    ? await svc.from('attendance').select('booking_id').in('booking_id', (movingBookings || []).map((b: any) => b.id))
    : { data: [] }
  if ((attended || []).length > 0)
    return NextResponse.json({ error: 'A swimmer has already checked in to this lesson, so it cannot be moved.' }, { status: 409 })

  const { data: course } = await svc
    .from('course_types').select('name, duration_minutes').eq('id', sess.course_type_id).single()
  if (!course) return NextResponse.json({ error: 'Course type not found' }, { status: 500 })

  const toMin = (t: string) => { const [hh, mm] = String(t).slice(0, 5).split(':').map(Number); return hh * 60 + mm }
  const toT = (n: number) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0')

  const spanStart = toMin(time)
  const spanEnd = spanStart + moveSessionIds.length * course.duration_minutes
  const placements = moveSessionIds.map((id, i) => ({
    id,
    start: toT(spanStart + i * course.duration_minutes),
    end: toT(spanStart + (i + 1) * course.duration_minutes),
  }))

  // Target conflict, interval-based rather than start-time equality: an hour
  // lesson's second half sits off-grid, so equality would miss it entirely.
  // A session held by an unanswered 1-on-2 invitation has no enrolled seats
  // yet but is taken all the same (lib/bookings/invite-holds).
  const heldDay = (await inviteHeldSessions(svc, { coachIds: [coach_id], from: date, to: date }))
  const { data: dayRows0 } = await svc
    .from('class_sessions').select('id, start_time, end_time')
    .eq('coach_id', coach_id).eq('session_date', date)
    .in('status', ['open', 'full']).gt('enrolled_count', 0)
  const dayRows = [...(dayRows0 || []), ...heldDay]
  const clash = dayRows.some((r: any) => {
    if (moveSessionIds.includes(r.id)) return false
    const rs = toMin(r.start_time)
    const re = r.end_time ? toMin(r.end_time) : rs + course.duration_minutes
    return spanStart < re && spanEnd > rs
  })
  if (clash)
    return NextResponse.json({ error: 'The coach already has another lesson overlapping that time' }, { status: 400 })

  // The target coach's time off, by its hours, and the swimmers' other
  // lessons at the new time (found 2026-10-08). Neither was checked: a lesson
  // could be dragged onto an afternoon the coach had blocked, or on top of the
  // swimmer's own 1-on-4, and the family was emailed the new time. This route
  // updates class_sessions, so the bookings double-booking guard never fires.
  try {
    const blocks = await coachBlocksOn(svc, coach_id, [date])
    if (overlapsAny(blocks.get(date), spanStart, spanEnd))
      return NextResponse.json({ error: 'The coach has time off or a block during that time' }, { status: 409 })
    const studentIds: string[] = [...new Set(activeBookings.map(b => b.student_id as string))]
    const busy = (await studentLessonsOn(svc, studentIds, [date], moveSessionIds))
      .get(date)?.filter(l => l.s < spanEnd && l.e > spanStart) || []
    if (busy.length > 0) {
      const { data: who } = await svc.from('students').select('full_name').in('id', [...new Set(busy.map(l => l.studentId))])
      const names = (who || []).map(w => w.full_name).join(', ') || 'A swimmer'
      return NextResponse.json({ error: `${names} already has another lesson at that time` }, { status: 409 })
    }
    // A slot held for a fixed-class family's renewal: moved onto only after
    // the desk confirms (override_holds; owner, 2026-10-08). The families on
    // this lesson never count against their own hold.
    if (body.override_holds !== true) {
      const hits = await renewalHoldsInWay(svc, {
        coachId: coach_id, courseTypeId: sess.course_type_id, dates: [date], spanStart, spanEnd,
        seatsNeeded: activeBookings.length, defaultMax: sess.max_students || 1,
        exceptParentIds: activeBookings.map((b: any) => b.parent_id),
      })
      if (hits.size > 0) return NextResponse.json(renewalHoldRefusal(hits), { status: 409 })
    }
  } catch (e) {
    console.error('move-session checks:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "Could not check the coach's time off and the swimmers' lessons. Nothing was moved; please try again." }, { status: 503 })
  }

  // Cancelled rows on these sessions stay where they were (found 2026-10-07),
  // as the parent-side hour reschedule already does (bookings/hour). Moving
  // the session in place carries every row on it, and a cancelled row is
  // about the OLD time: a fixed-class leave in a 1-on-4 that went along to the
  // new date changed that family's term "last lesson" (termLastDates counts
  // leave rows), their renewal dates and their voucher's source-lesson date.
  // Read them, and the old shape of each session, before the move.
  const { data: oldShape } = await svc
    .from('class_sessions')
    .select('id, course_type_id, coach_id, session_date, start_time, end_time, max_students, level_min, level_max')
    .in('id', moveSessionIds)
  const { data: cancelledHere } = await svc
    .from('bookings').select('id, class_session_id')
    .in('class_session_id', moveSessionIds).eq('status', 'cancelled')

  // One row update per half; bookings follow their session automatically
  for (const pl of placements) {
    const { error: updErr } = await svc
      .from('class_sessions')
      .update({ coach_id, session_date: date, start_time: pl.start, end_time: pl.end })
      .eq('id', pl.id)
    if (updErr)
      return NextResponse.json({ error: 'Move failed: ' + updErr.message }, { status: 500 })
  }
  const endTime = placements[placements.length - 1].end

  // The day-before SMS goes once per booking (reminder_sent_at). A lesson moved
  // after it went out kept the stamp, so the new time never got a reminder
  // (found 2026-10-07). Clear it on the rows that moved; the cron then judges
  // the new time by its usual window, and sends nothing if that has passed.
  {
    const { error: remErr } = await svc.from('bookings')
      .update({ reminder_sent_at: null })
      .in('class_session_id', moveSessionIds).neq('status', 'cancelled')
    if (remErr) console.error('move-session: could not clear reminder_sent_at:', remErr.message)
  }

  // Put the cancelled rows back on a session of their own at the old coach,
  // date and time (empty, as the one they were on was for them). Done after
  // the move, so the new session does not collide with the old one. The
  // lesson itself has already moved; a failure here is logged, not undone.
  const shape = new Map((oldShape || []).map((c: any) => [c.id, c]))
  for (const sid of [...new Set((cancelledHere || []).map((b: any) => b.class_session_id as string))]) {
    const was: any = shape.get(sid)
    if (!was) continue
    const rowIds = (cancelledHere || []).filter((b: any) => b.class_session_id === sid).map((b: any) => b.id)
    const { data: home, error: hErr } = await svc.from('class_sessions')
      .insert({ course_type_id: was.course_type_id, coach_id: was.coach_id, session_date: was.session_date,
                start_time: was.start_time, end_time: was.end_time, max_students: was.max_students,
                level_min: was.level_min ?? null, level_max: was.level_max ?? null,
                enrolled_count: 0, status: 'open' })
      .select('id').single()
    if (hErr || !home) {
      console.error(`\u26a0\ufe0f move-session: cancelled rows ${rowIds.join(', ')} moved with session ${sid} to ${date}; ` +
        `their old session could not be recreated -- fix by hand:`, hErr?.message)
      continue
    }
    const { error: rErr } = await svc.from('bookings').update({ class_session_id: home.id })
      .in('id', rowIds).eq('status', 'cancelled')
    if (rErr) {
      console.error(`\u26a0\ufe0f move-session: cancelled rows ${rowIds.join(', ')} moved with session ${sid} to ${date}; ` +
        `they could not be put back on ${home.id} -- fix by hand:`, rErr.message)
      await svc.from('class_sessions').delete().eq('id', home.id)
    }
  }

  // Notify every affected parent (cross-account included)
  try {
    const parentIds = [...new Set(activeBookings.map((b: any) => b.parent_id))]
    const studentIds = [...new Set(activeBookings.map((b: any) => b.student_id))]
    const [{ data: parents }, { data: students }, { data: coach }] = await Promise.all([
      svc.from('parents').select('id, first_name, email').in('id', parentIds),
      svc.from('students').select('id, full_name, parent_id').in('id', studentIds),
      svc.from('coaches').select('first_name, last_name').eq('id', coach_id).single(),
    ])
    // Read after the move: the trigger has re-placed the lesson by its new coach and time.
    const location = await sessionLocationLine(svc, placements[0]?.id)
    for (const pa of parents || []) {
      if (!pa.email) continue
      const names = (students || []).filter((st: any) => st.parent_id === pa.id).map((st: any) => st.full_name).join(', ')
      await sendEmail({
        type: 'booking_rescheduled',
        to: pa.email,
        parentName: pa.first_name,
        studentName: names,
        courseName: activeBookings.some((b: any) => b.is_trial) ? 'Swim Assessment' : course.name,
        coachName: coach ? (coach.first_name + ' ' + (coach.last_name || '')).trim() : '',
        date,
        time: t12(time) + ' – ' + t12(endTime),
        location,
      })
    }
  } catch (e) {
    console.error('Move-session email error:', e)
  }

  return NextResponse.json({ success: true })
}
