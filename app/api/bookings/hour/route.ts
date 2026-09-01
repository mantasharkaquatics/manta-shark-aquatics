import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireParent } from '@/lib/api-auth'
import { getCoachBlocks, isBlocked } from '@/lib/availability'
import { getEffectiveZones } from '@/lib/zones'
import { getTodayLA, getNowMinutesLA, formatTime12h, minutesUntil, daySlots, LESSON_MINUTES } from '@/lib/date'
import { LEAD_TIME_MINUTES, isWithin24Hours } from '@/lib/tokens'
import { priceLesson } from '@/lib/points'
import { applyPoints, InsufficientPoints, lessonsCompleted, walletSummary } from '@/lib/points-wallet'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

// One continuous 60-minute private lesson = two contiguous 30-minute halves
// (09:10–09:40 + 09:40–10:10) linked by lesson_group_id, priced as two
// half-hour lessons: each half carries its own points_charged, and the whole
// hour is judged off-peak or not on the time it STARTS, so a parent reading the
// clock gets the same answer we do.
// The second half starts off-grid on purpose: it swallows the 5-minute turnover,
// so the coach's next grid slot is 70 minutes later — a single 10-minute break.
// Halves may be taught by different coaches (relay) when no one covers the hour.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const HOUR_MINUTES = LESSON_MINUTES * 2
const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const toT = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')

type Iv = { s: number; e: number }

async function loadDay(svc: any, date: string, courseTypeId: string) {
  const [{ data: coaches }, { data: sessions }] = await Promise.all([
    svc.from('coaches').select('id, first_name, last_name').eq('is_active', true),
    svc.from('class_sessions')
      .select('id, coach_id, start_time, end_time, course_type_id, enrolled_count, max_students, status')
      .eq('session_date', date).in('status', ['open', 'full']),
  ])
  const ids = (coaches || []).map((c: any) => c.id)
  const blocks = await getCoachBlocks(svc, ids, date)
  const zones = new Map<string, any>()
  await Promise.all(ids.map(async (id: string) => { zones.set(id, await getEffectiveZones(svc, id, date)) }))
  const busy = new Map<string, Iv[]>()
  for (const s of sessions || []) {
    if ((s.enrolled_count || 0) <= 0) continue
    const st = toMin(s.start_time)
    const en = s.end_time ? toMin(s.end_time) : st + LESSON_MINUTES
    if (!busy.has(s.coach_id)) busy.set(s.coach_id, [])
    busy.get(s.coach_id)!.push({ s: st, e: en })
  }
  return { coaches: coaches || [], sessions: sessions || [], blocks, zones, busy }
}

function coachFree(day: any, coachId: string, startMin: number, endMin: number) {
  const eff = day.zones.get(coachId)
  if (!eff) return false
  if (!eff.legacy) {
    const inZone = eff.rows.some((z: any) => z.zone_type === 'private' && toMin(z.start_time) <= startMin && endMin <= toMin(z.end_time))
    if (!inZone) return false
  }
  if (isBlocked(day.blocks, coachId, toT(startMin), toT(endMin))) return false
  return !(day.busy.get(coachId) || []).some((iv: Iv) => startMin < iv.e && endMin > iv.s)
}

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth

  const body = await req.json().catch(() => null)
  if (!body?.action) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { action, student_id, student2_id, partner, session_date, lesson_group_id } = body
  if (!student_id || !session_date || !DATE_RE.test(session_date))
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })

  // Whitelist, not pass-through: only these two shapes may be booked as an hour.
  const courseSlug = body.course_slug === '1on2' ? '1on2' : '1on1'
  const { data: ct } = await svc.from('course_types')
    .select('id, name, slug, duration_minutes, max_students').eq('slug', courseSlug).single()
  if (!ct) return NextResponse.json({ error: 'Course type missing' }, { status: 500 })

  const { data: student } = await svc.from('students')
    .select('id, parent_id, full_name, current_level').eq('id', student_id).single()
  if (!student || student.parent_id !== parent.id)
    return NextResponse.json({ error: 'Student not found' }, { status: 403 })
  if (student.current_level == null)
    return NextResponse.json({ error: 'This student must complete a Swim Assessment before booking lessons.' }, { status: 403 })

  // A 1-on-2 always books BOTH seats at once - it never joins a stranger's
  // half-full session - so the second swimmer is required, not optional.
  let student2: any = null
  if (ct.slug === '1on2' && (student2_id || (action === 'book' && !partner))) {
    // Only a fresh booking must name the second swimmer. `options` and
    // `reschedule` act on a lesson that already exists, so its roster is read
    // back from lesson_group_id instead - requiring it here returned 400 and
    // left the reschedule picker with no slots at all.
    if (!student2_id)
      return NextResponse.json({ error: 'A 1-on-2 lesson needs a second swimmer.' }, { status: 400 })
    if (student2_id === student_id)
      return NextResponse.json({ error: 'Please pick two different swimmers.' }, { status: 400 })
    const { data: s2 } = await svc.from('students')
      .select('id, parent_id, full_name, current_level').eq('id', student2_id).single()
    if (!s2 || s2.parent_id !== parent.id)
      return NextResponse.json({ error: 'Second student not found' }, { status: 403 })
    if (s2.current_level == null)
      return NextResponse.json({ error: 'The second student must complete a Swim Assessment before booking lessons.' }, { status: 403 })
    student2 = s2
  }
  // Cross-account: the second seat belongs to another family. Their child is
  // validated here but NOT charged - credits are taken when they accept.
  let partnerStudent: any = null
  const isPartnerBooking = ct.slug === '1on2' && !!partner && !student2
  if (isPartnerBooking) {
    const { data: ps } = await svc.from('students')
      .select('id, parent_id, full_name, current_level').eq('id', partner.student_id).single()
    if (!ps || ps.parent_id !== partner.parent_id)
      return NextResponse.json({ error: 'Partner student not found' }, { status: 400 })
    if (ps.current_level == null)
      return NextResponse.json({ error: 'The partner student must complete a Swim Assessment before booking lessons.' }, { status: 400 })
    partnerStudent = ps
  }
  const students: any[] = student2 ? [student, student2] : [student]
  const seats = students.length + (isPartnerBooking ? 1 : 0)

  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  if (session_date < today) return NextResponse.json({ error: 'That date has passed.' }, { status: 400 })

  const day = await loadDay(svc, session_date, ct.id)
  const nameOf = (id: string) => { const c = day.coaches.find((x: any) => x.id === id); return c ? c.first_name : '' }

  // Rescheduling: the lesson's OWN two sessions must not count as conflicts —
  // not against the student (they ARE the student's lesson) and not against the
  // coach, or every candidate near the current time is reported as taken.
  const excludeSessIds = new Set<string>()
  const groupStudentIds = new Set<string>()
  let currentDate: string | null = null
  let currentStart: string | null = null
  if (lesson_group_id) {
    const { data: grp } = await svc.from('bookings')
      .select('class_session_id, parent_id, student_id').eq('lesson_group_id', lesson_group_id).neq('status', 'cancelled')
    const rows = grp || []
    if (rows.length === 0 || rows.some((r: any) => r.parent_id !== parent.id))
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    for (const r of rows) if (r.class_session_id) excludeSessIds.add(r.class_session_id)
    // Rescheduling moves an EXISTING lesson, so who is in it comes from the
    // group itself - the caller need not resend student2_id, and a 1-on-2's
    // second swimmer is conflict-checked either way.
    for (const r of rows) if (r.student_id) groupStudentIds.add(r.student_id)
    // The picker must be able to SAY which slot is the lesson's present time —
    // it stays selectable (moving coach but not time is legitimate) but should
    // not look like a fresh opening.
    const { data: curRows } = await svc.from('class_sessions')
      .select('session_date, start_time').in('id', Array.from(excludeSessIds))
    const first = (curRows || []).sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)))[0]
    if (first) { currentDate = first.session_date; currentStart = String(first.start_time).slice(0, 5) }
    const nb = new Map<string, Iv[]>()
    for (const sx of day.sessions) {
      if (excludeSessIds.has(sx.id) || (sx.enrolled_count || 0) <= 0) continue
      const st = toMin(sx.start_time)
      const en = sx.end_time ? toMin(sx.end_time) : st + LESSON_MINUTES
      if (!nb.has(sx.coach_id)) nb.set(sx.coach_id, [])
      nb.get(sx.coach_id)!.push({ s: st, e: en })
    }
    day.busy = nb
  }

  const { data: myBookings } = await svc.from('bookings')
    .select('class_session_id, status')
    .in('student_id', Array.from(new Set([...students.map((x: any) => x.id), ...groupStudentIds])))
    .not('status', 'in', '("cancelled","pending_partner")')
  const mySessIds = new Set((myBookings || []).map((b: any) => b.class_session_id))
  const mine: Iv[] = day.sessions.filter((s: any) => mySessIds.has(s.id) && !excludeSessIds.has(s.id)).map((s: any) => {
    const st = toMin(s.start_time)
    return { s: st, e: s.end_time ? toMin(s.end_time) : st + LESSON_MINUTES }
  })
  const studentBusy = (a: number, b: number) => mine.some(iv => a < iv.e && b > iv.s)

  if (action === 'options') {
    const slots = daySlots()
    const out: any[] = []
    for (const sl of slots) {
      const s1 = toMin(sl.start)
      const mid = s1 + LESSON_MINUTES
      const e2 = s1 + HOUR_MINUTES
      if (minutesUntil(session_date, sl.start, today, nowMin) < LEAD_TIME_MINUTES) continue
      if (studentBusy(s1, e2)) continue
      // Relay removed 2026-07-29 (owner decision): a 60-minute lesson is taught by
      // ONE coach from start to finish. An hour nobody can cover alone is simply
      // not offered — we no longer stitch two coaches together to fill it.
      const both = day.coaches
        .filter((c: any) => coachFree(day, c.id, s1, mid) && coachFree(day, c.id, mid, e2))
        .map((c: any) => c.id)
      if (both.length === 0) continue
      const combos = both.map((id: string) => ({ coach1_id: id, coach2_id: id, relay: false }))
      out.push({
        start_time: sl.start, mid_time: toT(mid), end_time: toT(e2),
        label: `${formatTime12h(sl.start)} – ${formatTime12h(toT(e2))}`,
        is_current: session_date === currentDate && sl.start === currentStart,
        options: combos.map((c: any) => ({ ...c, coach1_name: nameOf(c.coach1_id), coach2_name: nameOf(c.coach2_id) })),
      })
    }
    // The price of an hour depends on WHICH hour, so each slot carries its own
    // figure rather than one headline number the parent then finds is wrong.
    const wallet = await walletSummary(svc, parent.id)
    const seatsToPay = isPartnerBooking ? 1 : Math.max(1, students.length)
    for (const slot of out) {
      const pr = priceLesson({
        courseSlug: ct.slug, minutes: HOUR_MINUTES,
        lessonsCompleted: wallet.lessonsCompleted,
        sessionDate: session_date, startTime: slot.start_time, seats: seatsToPay,
      })
      slot.points = pr.charged
      slot.off_peak = pr.offPeak
    }
    const { data: rosterRows } = groupStudentIds.size
      ? await svc.from('students').select('id, full_name').in('id', Array.from(groupStudentIds))
      : { data: [] as any[] }
    return NextResponse.json({
      slots: out,
      balance: wallet.balance,
      vip_level: wallet.vipLevel,
      vip_discount: wallet.vipDiscount,
      seats_paid: seatsToPay,
      roster: (rosterRows || []).map((x: any) => ({ id: x.id, full_name: x.full_name })),
    })
  }

  if (action === 'book') {
    const { start_time, coach1_id, coach2_id } = body
    if (!start_time || !TIME_RE.test(start_time) || !coach1_id || !coach2_id)
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    if (coach1_id !== coach2_id)
      return NextResponse.json({ error: 'A 60-minute lesson must be taught by a single coach.' }, { status: 400 })
    const s1 = toMin(start_time)
    const mid = s1 + LESSON_MINUTES
    const e2 = s1 + HOUR_MINUTES
    if (!daySlots().some(sl => sl.start === start_time))
      return NextResponse.json({ error: 'That start time is not on the schedule.' }, { status: 400 })
    if (minutesUntil(session_date, start_time, today, nowMin) < LEAD_TIME_MINUTES)
      return NextResponse.json({ error: 'Bookings must be made at least 30 minutes before the lesson starts.' }, { status: 400 })
    if (studentBusy(s1, e2))
      return NextResponse.json({ error: 'This swimmer already has a lesson during that hour.' }, { status: 409 })
    if (!coachFree(day, coach1_id, s1, mid))
      return NextResponse.json({ error: 'The first half is no longer available. Please pick another time.' }, { status: 409 })
    if (!coachFree(day, coach2_id, mid, e2))
      return NextResponse.json({ error: 'The second half is no longer available. Please pick another time.' }, { status: 409 })

    // The price. Worked out here, from the hour's start time, and never sent by
    // the client. A cross-account 1-on-2 charges nobody yet -- each family pays
    // for its own seat when the second one accepts.
    const seatsToPay = isPartnerBooking ? 1 : students.length
    let price
    try {
      price = priceLesson({
        courseSlug: ct.slug, minutes: HOUR_MINUTES,
        lessonsCompleted: await lessonsCompleted(svc, parent.id),
        sessionDate: session_date, startTime: start_time, seats: seatsToPay,
      })
    } catch {
      return NextResponse.json({ error: 'This lesson cannot be paid for with points.' }, { status: 400 })
    }

    const groupId = randomUUID()
    const partnerExpiry = isPartnerBooking ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null
    const halves = [
      { coach_id: coach1_id, start: toT(s1), end: toT(mid) },
      { coach_id: coach2_id, start: toT(mid), end: toT(e2) },
    ]
    const createdBookings: string[] = []
    const createdSessions: string[] = []
    let pointsTaken = 0
    async function rollback(why: string) {
      if (pointsTaken > 0) {
        await applyPoints(svc, {
          parentId: parent.id, reason: 'booking_failed', points: pointsTaken,
          actor: 'system', note: why,
        }).catch(e => console.error('points rollback failed:', e))
        pointsTaken = 0
      }
      if (createdBookings.length > 0) await svc.from('bookings').delete().in('id', createdBookings)
      if (createdSessions.length > 0) await svc.from('class_sessions').delete().in('id', createdSessions)
    }

    // Take the points BEFORE a single row exists, so a family who cannot pay is
    // turned away with nothing to undo. applyPoints is the only arbiter of the
    // balance -- it writes under a guard naming the balance it read, so two
    // concurrent hour bookings cannot both spend the same points.
    if (!isPartnerBooking) {
      try {
        await applyPoints(svc, {
          parentId: parent.id, reason: 'booking', points: -price.charged,
          pricing: price, actor: 'parent',
        })
        pointsTaken = price.charged
      } catch (e: any) {
        if (e instanceof InsufficientPoints)
          return NextResponse.json({ error: 'NOT_ENOUGH_POINTS', needed: e.needed, available: e.available }, { status: 400 })
        console.error('points charge failed:', e)
        return NextResponse.json({ error: 'Could not take the points for this booking. Please try again.' }, { status: 500 })
      }
    }

    for (const h of halves) {
      const { data: existing } = await svc.from('class_sessions')
        .select('id, enrolled_count, max_students')
        .eq('coach_id', h.coach_id).eq('session_date', session_date).eq('start_time', h.start)
        .eq('course_type_id', ct.id).in('status', ['open', 'full']).maybeSingle()
      let sessId: string
      if (existing && existing.enrolled_count + seats <= existing.max_students) {
        sessId = existing.id
      } else if (existing) {
        await rollback('the time filled up')
        return NextResponse.json({ error: 'That time just filled up. Please pick another.' }, { status: 409 })
      } else {
        const { data: created, error: sErr } = await svc.from('class_sessions')
          .insert({ course_type_id: ct.id, coach_id: h.coach_id, session_date, start_time: h.start, end_time: h.end, max_students: ct.max_students, enrolled_count: 0, status: 'open' })
          .select('id').single()
        if (sErr || !created) { await rollback('the time slot could not be created'); return NextResponse.json({ error: sErr?.message?.includes('coach_timeslot_conflict') ? 'The coach already has another class at this time.' : 'Could not create the time slot.' }, { status: 409 }) }
        sessId = created.id
        createdSessions.push(created.id)
      }
      // Cross-account: this half gets TWO pending rows (ours + theirs), linked to
      // each other, unpaid. Nobody is charged until the partner accepts, and the
      // whole group of four lives or dies together on lesson_group_id.
      if (isPartnerBooking) {
        const { data: mine, error: mErr } = await svc.from('bookings').insert({
          class_session_id: sessId, parent_id: parent.id, student_id: student.id,
          lesson_credit_id: null, status: 'pending_partner', pending_action: null,
          pending_expires_at: partnerExpiry, lesson_group_id: groupId,
        }).select('id').single()
        if (mErr || !mine) { await rollback('the booking could not be written'); return NextResponse.json({ error: 'Could not complete the booking.' }, { status: 409 }) }
        createdBookings.push(mine.id)

        const { data: guest, error: gErr } = await svc.from('bookings').insert({
          class_session_id: sessId, parent_id: partner.parent_id, student_id: partnerStudent.id,
          lesson_credit_id: null, status: 'pending_partner', pending_action: 'confirm',
          pending_expires_at: partnerExpiry, partner_parent_id: parent.id,
          partner_booking_id: mine.id, partnership_id: partner.partnership_id || null,
          is_guest: true, lesson_group_id: groupId,
        }).select('id').single()
        if (gErr || !guest) { await rollback('the partner invitation could not be written'); return NextResponse.json({ error: 'Could not create partner invitation. Please try again.' }, { status: 409 }) }
        createdBookings.push(guest.id)

        await svc.from('bookings').update({ partner_booking_id: guest.id }).eq('id', mine.id)
        continue
      }

      for (const st of students) {
        // Each half-hour row carries its own half of the price, so cancelling
        // adds back up exactly and a half taught is a half counted.
        const { data: bk, error: bErr } = await svc.from('bookings')
          .insert({ class_session_id: sessId, parent_id: parent.id, student_id: st.id,
                    lesson_credit_id: null, token_package_id: null,
                    points_charged: price.perHalfHour, status: 'confirmed', lesson_group_id: groupId })
          .select('id').single()
        if (bErr || !bk) {
          await rollback('a booking row could not be written')
          const m = bErr?.message || ''
          const msg = m.includes('STUDENT_DOUBLE_BOOKED')
            ? `${st.full_name} already has a lesson at this time.`
            : m.includes('coach_timeslot_conflict')
            ? 'The coach already has another class at this time.'
            : 'Could not complete the booking.'
          return NextResponse.json({ error: msg }, { status: 409 })
        }
        createdBookings.push(bk.id)
      }
    }

    // Partner mode: invite the other family instead of confirming anything.
    if (isPartnerBooking) try {
      const [{ data: me }, { data: pp }] = await Promise.all([
        svc.from('parents').select('first_name, last_name').eq('id', parent.id).single(),
        svc.from('parents').select('first_name, email').eq('id', partner.parent_id).single(),
      ])
      if (pp?.email) {
        await sendEmail({
          type: 'partner_booking_invite', to: pp.email, parentName: pp.first_name,
          studentName: partnerStudent.full_name,
          inviterName: ((me?.first_name || '') + ' ' + (me?.last_name || '')).trim(),
          courseName: `${ct.name} (60 min)`, coachName: nameOf(coach1_id),
          date: session_date, time: `${formatTime12h(toT(s1))} - ${formatTime12h(toT(e2))}`,
        })
      }
    } catch {}

    // Nothing is confirmed yet in partner mode, so the confirmation email would
    // be a lie. The invitation email is sent above.
    if (!isPartnerBooking) try {
      const { data: p } = await svc.from('parents').select('first_name, email').eq('id', parent.id).single()
      if (p?.email) {
        const who = coach1_id === coach2_id ? nameOf(coach1_id) : `${nameOf(coach1_id)} → ${nameOf(coach2_id)}`
        await sendEmail({
          type: 'booking_confirmed', to: p.email, parentName: p.first_name,
          studentName: students.map((x: any) => x.full_name).join(' & '), courseName: `${ct.name} (60 min)`, coachName: who,
          date: session_date, time: `${formatTime12h(toT(s1))} – ${formatTime12h(toT(e2))}`,
        })
      }
    } catch {}

    return NextResponse.json({ ok: true, pending_partner: isPartnerBooking, lesson_group_id: groupId, booking_ids: createdBookings, start_time: toT(s1), end_time: toT(e2), relay: coach1_id !== coach2_id })
  }

  if (action === 'reschedule') {
    const { start_time, coach1_id, coach2_id } = body
    if (!lesson_group_id || !start_time || !TIME_RE.test(start_time) || !coach1_id || !coach2_id)
      return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
    if (coach1_id !== coach2_id)
      return NextResponse.json({ error: 'A 60-minute lesson must be taught by a single coach.' }, { status: 400 })
    const s1 = toMin(start_time)
    const mid = s1 + LESSON_MINUTES
    const e2 = s1 + HOUR_MINUTES
    if (!daySlots().some(sl => sl.start === start_time))
      return NextResponse.json({ error: 'That start time is not on the schedule.' }, { status: 400 })
    if (minutesUntil(session_date, start_time, today, nowMin) < LEAD_TIME_MINUTES)
      return NextResponse.json({ error: 'Bookings must be made at least 30 minutes before the lesson starts.' }, { status: 400 })

    const { data: grp } = await svc.from('bookings')
      .select('id').eq('lesson_group_id', lesson_group_id).neq('status', 'cancelled')
    if ((grp || []).length < 2)
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    const { data: curSess } = await svc.from('class_sessions')
      .select('id, session_date, start_time').in('id', Array.from(excludeSessIds))
    const ordered = (curSess || []).sort((a: any, b: any) => String(a.start_time).localeCompare(String(b.start_time)))
    if (ordered.length < 2)
      return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
    if (isWithin24Hours(ordered[0].session_date, String(ordered[0].start_time).slice(0, 5)))
      return NextResponse.json({ error: 'Lessons cannot be rescheduled within 24 hours of the start time.' }, { status: 400 })

    if (studentBusy(s1, e2))
      return NextResponse.json({ error: 'This swimmer already has a lesson during that hour.' }, { status: 409 })
    if (!coachFree(day, coach1_id, s1, mid))
      return NextResponse.json({ error: 'The first half is no longer available. Please pick another time.' }, { status: 409 })
    if (!coachFree(day, coach2_id, mid, e2))
      return NextResponse.json({ error: 'The second half is no longer available. Please pick another time.' }, { status: 409 })

    // Move in place: the bookings keep their ids, their points and their group
    // link. A reschedule is the same lesson at a new time, so it is not
    // re-priced -- otherwise a parent could book a peak hour and shift it
    // off-peak for the discount.
    const halves = [
      { id: ordered[0].id, coach_id: coach1_id, start: toT(s1), end: toT(mid) },
      { id: ordered[1].id, coach_id: coach2_id, start: toT(mid), end: toT(e2) },
    ]
    for (const h of halves) {
      const { error: uErr } = await svc.from('class_sessions')
        .update({ coach_id: h.coach_id, session_date, start_time: h.start, end_time: h.end })
        .eq('id', h.id)
      if (uErr)
        return NextResponse.json({ error: uErr.message?.includes('coach_timeslot_conflict') ? 'The coach already has another class at this time.' : 'Could not move the lesson.' }, { status: 409 })
    }

    // Name everyone actually in the lesson, read back from the group rather
    // than from the request body.
    const { data: grpStudents } = await svc.from('students')
      .select('full_name').in('id', Array.from(groupStudentIds))
    const rescheduledNames = (grpStudents || []).map((x: any) => x.full_name).join(' & ') || student.full_name

    try {
      const { data: p } = await svc.from('parents').select('first_name, email').eq('id', parent.id).single()
      if (p?.email) {
        const who = coach1_id === coach2_id ? nameOf(coach1_id) : `${nameOf(coach1_id)} → ${nameOf(coach2_id)}`
        await sendEmail({
          type: 'booking_rescheduled', to: p.email, parentName: p.first_name,
          studentName: rescheduledNames, courseName: `${ct.name} (60 min)`, coachName: who,
          date: session_date, time: `${formatTime12h(toT(s1))} – ${formatTime12h(toT(e2))}`,
        })
      }
    } catch {}

    return NextResponse.json({ ok: true, lesson_group_id, start_time: toT(s1), end_time: toT(e2), relay: coach1_id !== coach2_id })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
