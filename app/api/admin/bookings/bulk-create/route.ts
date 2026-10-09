import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'
import { getEffectiveZones, zoneTypeForSlug } from '@/lib/zones'
import { priceLesson } from '@/lib/points'
import { applyPoints, InsufficientPoints, walletSummary } from '@/lib/points-wallet'
import { alertRollbackFailed } from '@/lib/bookings/rollback-alert'
import { activePartnershipId } from '@/lib/partnerships'
import { sessionsHeldByInvites } from '@/lib/bookings/invite-holds'
import { coachBlocksOn, overlapsAny, studentLessonsOn, renewalHoldsInWay, renewalHoldRefusal, type HoldHit } from '@/lib/bookings/desk-checks'
import { allRows } from '@/lib/db-paging'
import { sessionLocationLines } from '@/lib/locations'

// Recurring bulk booking for admin.
// action=preview: generate weekly candidate dates with per-date conflict status.
// action=commit: re-validate confirmed dates, create sessions/bookings, FIFO credit
// deduction via atomic RPCs, full rollback on any failure. enrolled_count is owned
// by DB trigger trg_booking_count and never touched here.
// All date math is pure YYYY-MM-DD string arithmetic in UTC domain; "today" and
// "now" come from lib/date.ts LA helpers. Same-day bookings are allowed as long
// as the start time has not passed in LA.

// renewal_hold: free, but kept for a fixed-class family's renewal (`hold` says
// whose, and until when). The desk may book it only by confirming again
// (override_holds; owner, 2026-10-08).
type Candidate = { date: string; status: 'ok' | 'past' | 'coach_time_off' | 'conflict' | 'full' | 'student_busy' | 'skipped' | 'renewal_hold'; hold?: HoldHit }

// Why a date was refused at commit, for the desk's error line.
const WHY: Record<string, string> = {
  coach_time_off: 'the coach has time off or a block then',
  conflict: 'the coach has another class then',
  full: 'the class is full',
  student_busy: 'the swimmer already has another lesson then',
  renewal_hold: 'it is held for a fixed-class renewal',
  skipped: 'skipped',
  past: 'past',
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}
function minutesToTime(mins: number): string {
  const h = String(Math.floor(mins / 60)).padStart(2, '0')
  const m = String(mins % 60).padStart(2, '0')
  return `${h}:${m}:00`
}

async function evaluateDates(
  svc: any,
  opts: { coachId: string; courseTypeId: string; startTime: string; startDate: string; count: number; spotsNeeded: number; skipDates: string[]; hour?: boolean; durationMinutes?: number; studentIds: string[]; dates?: string[]; parentIds: string[]; maxStudents: number }
): Promise<Candidate[]> {
  const { coachId, courseTypeId, startTime, startDate, count, spotsNeeded, skipDates, hour, durationMinutes, studentIds } = opts
  const startMins = timeToMinutes(startTime)
  // The whole lesson: both halves of an hour.
  const spanStart = startMins
  const spanEnd = startMins + (durationMinutes || 30) * (hour ? 2 : 1)

  // A preview walks forward week by week, with enough spare weeks to cover
  // skips and conflicts (safety cap). A commit checks exactly the dates the
  // desk confirmed: it used to regenerate 3,012 weeks here, one URL too long
  // for the API, and the failed read let every date through (found 2026-10-08).
  const allDates: string[] = []
  if (opts.dates) allDates.push(...[...new Set(opts.dates)].sort())
  else for (let i = 0; i < count * 3 + 12; i++) allDates.push(addDays(startDate, i * 7))

  // Time off counts only where its hours touch this lesson; a whole-day
  // block touches everything.
  const blocks = await coachBlocksOn(svc, coachId, allDates)
  const lessons = await studentLessonsOn(svc, studentIds, allDates)

  const { data: sessRows, error: sessErr } = await allRows(() => svc
    .from('class_sessions')
    .select('id, session_date, start_time, end_time, course_type_id, enrolled_count, max_students, status')
    .eq('coach_id', coachId)
    .in('session_date', allDates)
    .in('status', ['open', 'full'])
    .order('id'))
  if (sessErr) throw new Error(`class_sessions read failed: ${sessErr.message || sessErr}`)
  // A 1-on-2 invitation still waiting for its answer holds its session; its
  // seats are not in enrolled_count yet (lib/bookings/invite-holds).
  const inviteHeld = await sessionsHeldByInvites(svc, (sessRows || []).filter((r: any) => (r.enrolled_count || 0) <= 0).map((r: any) => r.id))
  const sessByDate = new Map<string, any[]>()
  for (const s0 of sessRows || []) {
    const s = inviteHeld.has(s0.id) ? { ...s0, enrolled_count: s0.max_students } : s0
    if (!sessByDate.has(s.session_date)) sessByDate.set(s.session_date, [])
    sessByDate.get(s.session_date)!.push(s)
  }

  // Fixed-class renewal holds, the same test the parent paths use
  // (lib/bookings/desk-checks renewalHoldsInWay; found 2026-10-08).
  const holdHits = await renewalHoldsInWay(svc, {
    coachId, courseTypeId, dates: allDates, spanStart, spanEnd,
    seatsNeeded: spotsNeeded, defaultMax: opts.maxStudents, exceptParentIds: opts.parentIds,
    capacity: date => {
      if (hour) return null
      const m = (sessByDate.get(date) || []).find((x: any) => timeToMinutes(x.start_time) === startMins && x.course_type_id === courseTypeId)
      return m ? { enrolled: m.enrolled_count || 0, max: m.max_students } : null
    },
  })

  const skipSet = new Set(skipDates)
  const candidates: Candidate[] = []
  let okCount = 0

  for (const date of allDates) {
    if (!opts.dates && okCount >= count) break
    let status: Candidate['status'] = 'ok'

    // Past dates are allowed: this API is admin-only (requireAdmin) and past
    // bookings are legitimate back-entries of lessons that already happened
    // (credits deducted as normal). Conflict/time-off/capacity checks still apply.
    if (skipSet.has(date)) status = 'skipped'
    else if (overlapsAny(blocks.get(date), spanStart, spanEnd)) status = 'coach_time_off'
    else if (hour) {
      // An hour occupies two halves and the second one starts OFF the grid, so a
      // lesson at the next grid slot overlaps it without sharing a start time.
      // Equality would miss that; the whole span has to be tested as an interval.
      const clash = (sessByDate.get(date) || []).some((s: any) => {
        if ((s.enrolled_count || 0) <= 0) return false
        const ss = timeToMinutes(s.start_time)
        const se = s.end_time ? timeToMinutes(s.end_time) : ss + (durationMinutes || 30)
        return spanStart < se && spanEnd > ss
      })
      if (clash) status = 'conflict'
    }
    else {
      const daySessions = sessByDate.get(date) || []
      const sameSlot = daySessions.filter((s: any) => timeToMinutes(s.start_time) === startMins)
      const matching = sameSlot.find((s: any) => s.course_type_id === courseTypeId)
      const foreign = sameSlot.find((s: any) => s.course_type_id !== courseTypeId && s.enrolled_count > 0)
      if (foreign) status = 'conflict'
      else if (matching && matching.enrolled_count + spotsNeeded > matching.max_students) status = 'full'
    }
    // The swimmer's own lessons, any coach, any course.
    if (status === 'ok' && overlapsAny(lessons.get(date), spanStart, spanEnd)) status = 'student_busy'

    const hold = status === 'ok' ? holdHits.get(date) : undefined
    if (hold) status = 'renewal_hold'

    if (status === 'ok') okCount++
    candidates.push(hold ? { date, status, hold } : { date, status })
  }
  return candidates
}

/**
 * What one family owes for its share of a series.
 *
 * `unitsPerDate` is how many half-hour lessons that family is paying for on
 * each date: two for an hour lesson (two halves) or for a 1-on-2 with both
 * swimmers on the same account, one otherwise. Each date is priced on its own,
 * because the off-peak discount is judged per lesson.
 */
async function quoteSeries(
  svc: any, parentId: string, courseSlug: string,
  dates: string[], startTime: string, unitsPerDate: number,
) {
  const wallet = await walletSummary(svc, parentId)
  const perDate = new Map<string, number>()
  let total = 0
  for (const date of dates) {
    const unit = priceLesson({
      courseSlug, minutes: 30,
      sessionDate: date, startTime, seats: 1,
    }).perSeat
    perDate.set(date, unit)
    total += unit * unitsPerDate
  }
  return { perDate, total, balance: wallet.balance }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc

  const body = await req.json().catch(() => null)
  if (!body?.action) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const { action, coach_id, course_type_id, start_time, student_id, student2_id, payment_method, hour } = body
  if (!coach_id || !course_type_id || !start_time || !student_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (!TIME_RE.test(start_time)) {
    return NextResponse.json({ error: 'Invalid start_time format (HH:MM or HH:MM:SS)' }, { status: 400 })
  }
  if (student2_id && student2_id === student_id) {
    return NextResponse.json({ error: 'Student 2 must be different from Student 1' }, { status: 400 })
  }

  const { data: ct } = await svc
    .from('course_types')
    .select('id, name, slug, duration_minutes, max_students')
    .eq('id', course_type_id)
    .single()
  if (!ct) return NextResponse.json({ error: 'Course type not found' }, { status: 404 })

  const { data: student1 } = await svc.from('students').select('id, parent_id, full_name, current_level').eq('id', student_id).single()
  if (!student1) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  let student2: any = null
  if (student2_id) {
    const { data } = await svc.from('students').select('id, parent_id, full_name, current_level').eq('id', student2_id).single()
    if (!data) return NextResponse.json({ error: 'Student 2 not found' }, { status: 404 })
    student2 = data
  }
  // Swim assessment gate (owner rule): a swimmer with no level must take the
  // Swim Assessment first. This route never writes is_trial, so it can never
  // book an assessment itself - that is /api/admin/bookings/trial-credit-book.
  // An unlevelled swimmer reaching here is therefore always wrong, admin or not.
  for (const stu of [student1, student2].filter(Boolean)) {
    if (stu.current_level == null)
      return NextResponse.json({ error: `${stu.full_name} has not been assessed yet. Book a Swim Assessment first, or assign a level on the Upgrades page.` }, { status: 409 })
  }

  // A 60-minute lesson is 1-on-1 only and single-swimmer, matching the parent
  // side. It costs two of everything: two half-sessions, two bookings sharing a
  // lesson_group_id, and two half-hour lessons' worth of points.
  if (hour && (ct.slug !== '1on1' || student2))
    return NextResponse.json({ error: '60-minute lessons are 1-on-1 with a single swimmer.' }, { status: 400 })
  // A 1-on-2 always has two swimmers (owner, 2026-10-07), as the parent's
  // booking route already insists. A one-swimmer 1-on-2 was a private lesson
  // sold at the 1-on-2 price, and when it was later cancelled inside 24 hours
  // its make-up voucher named one child, which nothing can book.
  if (ct.slug === '1on2' && !student2)
    return NextResponse.json({ error: 'A 1-on-2 lesson needs two students. Pick the second swimmer as well.' }, { status: 400 })
  const spotsNeeded = student2 ? 2 : 1
  const twoFromParent1 = !!hour || (student2 ? student2.parent_id === student1.parent_id : false)
  const sameParent = student2 ? student2.parent_id === student1.parent_id : false
  // Only a 1-on-2 is one lesson shared by two families. Two families' swimmers
  // put into a group class together are two separate bookings: linking them
  // made one family's cancel take the other's seat down too.
  const linkPair = ct.slug === '1on2' && !sameParent

  if (action === 'preview') {
    const { start_date, count, skip_dates } = body
    if (!start_date || !DATE_RE.test(start_date) || !count || count < 1 || count > 50) {
      return NextResponse.json({ error: 'Invalid start_date (YYYY-MM-DD) or count (1-50)' }, { status: 400 })
    }
    if (Array.isArray(skip_dates) && skip_dates.some((d: any) => typeof d !== 'string' || !DATE_RE.test(d))) {
      return NextResponse.json({ error: 'Invalid skip_dates format' }, { status: 400 })
    }
    let candidates: Candidate[]
    try {
      candidates = await evaluateDates(svc, {
        coachId: coach_id, courseTypeId: course_type_id, startTime: start_time,
        startDate: start_date, count, spotsNeeded, skipDates: skip_dates || [], hour: !!hour, durationMinutes: ct.duration_minutes,
        studentIds: [student1.id, student2?.id].filter(Boolean),
        parentIds: [student1.parent_id, student2?.parent_id].filter(Boolean), maxStudents: ct.max_students,
      })
    } catch (e) {
      console.error('bulk-create preview:', e instanceof Error ? e.message : e)
      return NextResponse.json({ error: "Could not read the coach's schedule. Please try again." }, { status: 503 })
    }
    // Only the dates that can actually be booked are quoted -- showing a total
    // that includes dates the operator is about to be told are full would make
    // the number they read out to the family wrong.
    const okDates = candidates.filter(c => c.status === 'ok').map(c => c.date)
    const nameIds = student2 && !sameParent ? [student1.parent_id, student2.parent_id] : [student1.parent_id]
    const { data: pRows } = await svc.from('parents').select('id, first_name, last_name').in('id', nameIds)
    const nameOf = (pid: string) => {
      const r = (pRows || []).find(x => x.id === pid)
      return r ? `${r.first_name} ${r.last_name || ''}`.trim() : ''
    }

    let quote1, quote2 = null
    try {
      quote1 = await quoteSeries(svc, student1.parent_id, ct.slug || '', okDates, start_time, twoFromParent1 ? 2 : 1)
      if (student2 && !sameParent)
        quote2 = await quoteSeries(svc, student2.parent_id, ct.slug || '', okDates, start_time, 1)
    } catch {
      return NextResponse.json({ error: `${ct.name} cannot be paid for with points.` }, { status: 400 })
    }

    const points = {
      parent1_name: nameOf(student1.parent_id),
      parent1_balance: quote1.balance, parent1_needed: quote1.total,
      parent2_name: student2 && !sameParent ? nameOf(student2.parent_id) : null,
      parent2_balance: quote2?.balance ?? null, parent2_needed: quote2?.total ?? null,
      sufficient: quote1.balance >= quote1.total && (!quote2 || quote2.balance >= quote2.total),
    }
    // The same figures with the renewal-held weeks in, for when the desk
    // chooses to book over the holds.
    const heldDates = candidates.filter(c => c.status === 'renewal_hold').map(c => c.date)
    let pointsWithHeld = null
    if (heldDates.length > 0) {
      const all = [...okDates, ...heldDates]
      const h1 = await quoteSeries(svc, student1.parent_id, ct.slug || '', all, start_time, twoFromParent1 ? 2 : 1)
      const h2 = student2 && !sameParent ? await quoteSeries(svc, student2.parent_id, ct.slug || '', all, start_time, 1) : null
      pointsWithHeld = {
        ...points, parent1_needed: h1.total, parent2_needed: h2?.total ?? null,
        sufficient: h1.balance >= h1.total && (!h2 || h2.balance >= h2.total),
      }
    }

    return NextResponse.json({ candidates, points, pointsWithHeld })
  }

  if (action === 'commit') {
    const { dates } = body
    if (!Array.isArray(dates) || dates.length < 1 || dates.length > 50 || dates.some((d: any) => typeof d !== 'string' || !DATE_RE.test(d))) {
      return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
    }
    // Re-validate every confirmed date server-side: exactly those dates.
    let candidates: Candidate[]
    try {
      candidates = await evaluateDates(svc, {
        coachId: coach_id, courseTypeId: course_type_id, startTime: start_time,
        startDate: dates[0], count: dates.length, spotsNeeded, skipDates: [], hour: !!hour, durationMinutes: ct.duration_minutes,
        studentIds: [student1.id, student2?.id].filter(Boolean), dates,
        parentIds: [student1.parent_id, student2?.parent_id].filter(Boolean), maxStudents: ct.max_students,
      })
    } catch (e) {
      console.error('bulk-create commit check:', e instanceof Error ? e.message : e)
      return NextResponse.json({ error: "Could not read the coach's schedule, so nothing was booked. Please try again." }, { status: 503 })
    }
    const statusByDate = new Map(candidates.map(c => [c.date, c.status]))
    // A renewal hold is booked over only when the desk has confirmed it
    // (override_holds), after being shown whose and until when.
    const overrideHolds = body.override_holds === true
    for (const d of dates) {
      const st = statusByDate.get(d)
      if (st !== 'ok' && !(st === 'renewal_hold' && overrideHolds)) {
        if (st === 'renewal_hold') continue
        return NextResponse.json({ error: `Date ${d} is no longer available: ${(st && WHY[st]) || 'out of range'}.` }, { status: 409 })
      }
    }
    if (!overrideHolds) {
      const hits = new Map(candidates.filter(c => c.status === 'renewal_hold' && c.hold && dates.includes(c.date)).map(c => [c.date, c.hold!]))
      if (hits.size > 0) return NextResponse.json(renewalHoldRefusal(hits), { status: 409 })
    }

    // Level-band hard block (owner rule): banded 1on4 rejects out-of-band students for everyone, admin included.
    if (zoneTypeForSlug(ct.slug || '') === 'group') {
      const slotStartMin = timeToMinutes(start_time)
      const slotEndMin = slotStartMin + ct.duration_minutes
      for (const d of dates) {
        const eff = await getEffectiveZones(svc, coach_id, d)
        if (eff.legacy) continue
        const z = eff.rows.find(z => z.zone_type === 'group' && timeToMinutes(z.start_time) <= slotStartMin && slotEndMin <= timeToMinutes(z.end_time))
        if (!z || z.group_level_min == null || z.group_level_max == null) continue
        for (const stu of [student1, student2].filter(Boolean)) {
          if (stu.current_level == null || stu.current_level < z.group_level_min || stu.current_level > z.group_level_max) {
            const who = stu.current_level == null ? `${stu.full_name} has not been assessed yet` : `${stu.full_name} is Level ${stu.current_level}`
            return NextResponse.json({ error: `${who}; the ${d} class is Level ${z.group_level_min}\u2013${z.group_level_max} only.` }, { status: 409 })
          }
        }
      }
    }

    // Each family pays its own way, out of its own wallet -- exactly as it would if the parent had booked this themselves.
    // There is no payment choice left to make: one currency, one price.
    //
    // To comp a lesson, grant the family the points first and then book. That
    // keeps the gift visible on their statement instead of hidden in a booking
    // nobody was charged for.
    const units1 = twoFromParent1 ? 2 : 1
    let quote1, quote2 = null
    try {
      quote1 = await quoteSeries(svc, student1.parent_id, ct.slug || '', dates, start_time, units1)
      if (student2 && !sameParent)
        quote2 = await quoteSeries(svc, student2.parent_id, ct.slug || '', dates, start_time, 1)
    } catch {
      return NextResponse.json({ error: `${ct.name} cannot be paid for with points.` }, { status: 400 })
    }

    // The two families' link, recorded on the rows when they have one (the
    // desk may pair families who have not linked their accounts).
    const pairPartnership = student2 && !sameParent
      ? await activePartnershipId(svc, student1.parent_id, student2.parent_id)
      : null

    const endTime = minutesToTime(timeToMinutes(start_time) + ct.duration_minutes)
    const hourEndTime = minutesToTime(timeToMinutes(start_time) + ct.duration_minutes * 2)
    const createdBookingIds: string[] = []
    const createdSessionIds: string[] = []
    const taken: { parentId: string; points: number; granted: number; expires: string | null }[] = []
    // Granted points each family's debit used, handed out to its rows in the
    // order they are written (earliest lesson first).
    const grantLeft = new Map<string, { left: number; expires: string | null }>()
    const grantedFor = (parentId: string, points: number) => {
      const g = grantLeft.get(parentId)
      if (!g || g.left <= 0) return { points_granted: 0, points_granted_expires_at: null }
      const k = Math.min(g.left, points)
      g.left -= k
      return { points_granted: k, points_granted_expires_at: k > 0 ? g.expires : null }
    }

    async function rollback(why: string) {
      for (const t of taken) {
        await applyPoints(svc, {
          parentId: t.parentId, reason: 'booking_failed', points: t.points,
          grantedPart: t.granted, grantedExpiresAt: t.expires,
          actor: 'system', note: why,
        }).catch(e => alertRollbackFailed(svc, { parentId: t.parentId, points: t.points, granted: t.granted, why, where: 'desk booking (Booking page)', error: e }))
      }
      taken.length = 0
      if (createdBookingIds.length > 0) {
        // Linked cross-family rows point at each other; unlink before the
        // delete so the self-reference cannot hold either row in place.
        await svc.from('bookings').update({ partner_booking_id: null }).in('id', createdBookingIds)
        await svc.from('bookings').delete().in('id', createdBookingIds)
      }
      // Sessions we created ourselves go too, or a failed hour booking leaves an
      // empty off-grid slot sitting in the calendar.
      if (createdSessionIds.length > 0) {
        await svc.from('class_sessions').delete().in('id', createdSessionIds)
      }
    }

    // Both families settle before anything is written, so a family who cannot
    // pay is reported while there is still nothing to undo.
    const charges: { parentId: string; label: string; quote: typeof quote1; units: number }[] = [
      { parentId: student1.parent_id, label: 'This family', quote: quote1, units: units1 },
      ...(quote2 ? [{ parentId: student2.parent_id, label: "The second swimmer's family", quote: quote2, units: 1 }] : []),
    ]
    for (const c of charges) {
      try {
        const paid = await applyPoints(svc, {
          parentId: c.parentId, reason: 'booking', points: -c.quote.total, actor: `admin:${auth.admin?.id ?? 'unknown'}`,
          pricing: {
            kind: 'admin_series', courseSlug: ct.slug, startTime: start_time, hour: !!hour,
            unitsPerDate: c.units,
            dates: dates.map((d: string) => ({ date: d, points: c.quote.perDate.get(d)! * c.units })),
          },
          note: dates.length === 1 ? null : `Series booked at the desk: ${dates.length} lessons`,
        })
        taken.push({ parentId: c.parentId, points: c.quote.total, granted: paid.grantedTaken, expires: paid.grantedExpiresAt })
        grantLeft.set(c.parentId, { left: paid.grantedTaken, expires: paid.grantedExpiresAt })
      } catch (e: any) {
        await rollback('the other side of the booking could not pay')
        if (e instanceof InsufficientPoints)
          return NextResponse.json({ error: `${c.label} needs ${e.needed} points and has ${e.available}.` }, { status: 409 })
        console.error('points charge failed:', e)
        return NextResponse.json({ error: 'Could not take the points for this booking.' }, { status: 500 })
      }
    }

    // Each date's session (an hour: its first half), so the email can say
    // which pool each lesson is at.
    const sessOfDate: (string | undefined)[] = []
    for (let i = 0; i < dates.length; i++) {
      const date = dates[i]
      if (hour) {
        const groupId = randomUUID()
        const legs = [
          { start: start_time, end: endTime },
          { start: endTime, end: hourEndTime },
        ]
        for (const leg of legs) {
          const { data: exist } = await svc
            .from('class_sessions')
            .select('id, enrolled_count, max_students')
            .eq('coach_id', coach_id).eq('session_date', date).eq('start_time', leg.start)
            .eq('course_type_id', course_type_id).in('status', ['open', 'full'])
            .maybeSingle()
          let sid: string
          if (exist) {
            if (exist.enrolled_count + 1 > exist.max_students) {
              await rollback('one half of the hour was already taken')
              return NextResponse.json({ error: `The ${leg.start} half on ${date} is already taken` }, { status: 409 })
            }
            sid = exist.id
          } else {
            const { data: ns, error: se } = await svc
              .from('class_sessions')
              .insert({ coach_id, course_type_id, session_date: date, start_time: leg.start, end_time: leg.end, max_students: ct.max_students, enrolled_count: 0, status: 'open' })
              .select('id').single()
            if (se || !ns) {
              await rollback('a session could not be created')
              const conflict = se?.message?.includes('coach_timeslot_conflict')
              return NextResponse.json({ error: conflict ? `The coach already has another class during the hour on ${date}` : `Failed to create session on ${date}: ${se?.message || 'unknown'}` }, { status: 409 })
            }
            sid = ns.id
            createdSessionIds.push(ns.id)
          }
          if (!sessOfDate[i]) sessOfDate[i] = sid
          const { data: bk, error: be } = await svc
            .from('bookings')
            .insert({ class_session_id: sid, parent_id: student1.parent_id, student_id: student1.id,
                      lesson_credit_id: null, token_package_id: null,
                      points_charged: quote1.perDate.get(date)!,
                      ...grantedFor(student1.parent_id, quote1.perDate.get(date)!),
                      status: 'confirmed', lesson_group_id: groupId })
            .select('id').single()
          if (be || !bk) {
            await rollback('a booking row could not be written')
            const conflict = be?.message?.includes('coach_timeslot_conflict')
            return NextResponse.json({ error: conflict ? `The coach already has another class during the hour on ${date}` : `Failed to book ${date}: ${be?.message || 'unknown'}` }, { status: conflict ? 409 : 500 })
          }
          createdBookingIds.push(bk.id)
        }
        continue
      }
      // find or create session
      const { data: existing } = await svc
        .from('class_sessions')
        .select('id, enrolled_count, max_students')
        .eq('coach_id', coach_id).eq('session_date', date).eq('start_time', start_time)
        .eq('course_type_id', course_type_id).in('status', ['open', 'full'])
        .maybeSingle()
      let sessId: string
      if (existing) {
        if (existing.enrolled_count + spotsNeeded > existing.max_students
            || (await sessionsHeldByInvites(svc, [existing.id])).has(existing.id)) {
          await rollback('a class filled up')
          return NextResponse.json({ error: `Session on ${date} became full` }, { status: 409 })
        }
        sessId = existing.id
      } else {
        const { data: newSess, error: sessErr } = await svc
          .from('class_sessions')
          .insert({ coach_id, course_type_id, session_date: date, start_time, end_time: endTime, max_students: ct.max_students, enrolled_count: 0, status: 'open' })
          .select('id').single()
        if (sessErr || !newSess) {
          await rollback('a session could not be created')
          return NextResponse.json({ error: `Failed to create session on ${date}: ${sessErr?.message || 'unknown'}` }, { status: 500 })
        }
        sessId = newSess.id
        createdSessionIds.push(newSess.id)
      }
      sessOfDate[i] = sessId

      // Every swimmer's row carries the points that swimmer's family paid for
      // it, so cancelling one seat of a 1-on-2 refunds the right wallet.
      const toCreate = [
        { parent_id: student1.parent_id, student_id: student1.id, points: quote1.perDate.get(date)! },
        ...(student2
          ? [{
              parent_id: student2.parent_id, student_id: student2.id,
              points: (sameParent ? quote1 : quote2!).perDate.get(date)!,
            }]
          : []),
      ]
      const rowIds: string[] = []
      for (const [bi, b] of toCreate.entries()) {
        // A cross-family 1-on-2 is linked both ways, as the parent's invite
        // and confirm flow links it (create/route.ts, hour/route.ts): the
        // second family's row names the first family and its row, and the
        // first row is pointed back at it below. Without the link the lesson
        // looked like one family's alone, so it could be late-cancelled or
        // moved online by one side (found 2026-10-07).
        const link = bi === 1 && linkPair && rowIds[0]
          ? { partner_booking_id: rowIds[0], partner_parent_id: student1.parent_id, partnership_id: pairPartnership }
          : {}
        const { data: created, error: bookErr } = await svc
          .from('bookings')
          .insert({ class_session_id: sessId, parent_id: b.parent_id, student_id: b.student_id,
                    lesson_credit_id: null, token_package_id: null,
                    points_charged: b.points, ...grantedFor(b.parent_id, b.points), status: 'confirmed', ...link })
          .select('id').single()
        if (bookErr || !created) {
          await rollback('a booking row could not be written')
          const isConflict = bookErr?.message?.includes('coach_timeslot_conflict')
          return NextResponse.json(
            { error: isConflict ? `Date ${date} conflicts with another session for this coach` : `Failed to book ${date}: ${bookErr?.message || 'unknown'}` },
            { status: isConflict ? 409 : 500 }
          )
        }
        createdBookingIds.push(created.id)
        rowIds.push(created.id)
      }
      if (rowIds.length === 2 && linkPair) {
        const { error: linkErr } = await svc.from('bookings').update({ partner_booking_id: rowIds[1] }).eq('id', rowIds[0])
        if (linkErr) {
          await rollback('the two families could not be linked')
          return NextResponse.json({ error: `Failed to book ${date}: ${linkErr.message || 'unknown'}` }, { status: 500 })
        }
      }
    }

    // One summary email per parent (best effort)
    try {
      const { data: coach } = await svc.from('coaches').select('first_name, last_name').eq('id', coach_id).single()
      const coachName = coach ? `${coach.first_name} ${coach.last_name || ''}`.trim() : ''
      const timeStr = `${formatTime12h(start_time)} \u2013 ${formatTime12h(hour ? hourEndTime : endTime)}`
      const locs = await sessionLocationLines(svc, sessOfDate)
      const targets: { parent_id: string; studentName: string; partnerName?: string }[] = sameParent || !student2
        ? [{ parent_id: student1.parent_id, studentName: student2 ? `${student1.full_name} & ${student2.full_name}` : student1.full_name }]
        : [
            { parent_id: student1.parent_id, studentName: student1.full_name, partnerName: student2.full_name },
            { parent_id: student2.parent_id, studentName: student2.full_name, partnerName: student1.full_name },
          ]
      for (const t of targets) {
        const { data: p } = await svc.from('parents').select('first_name, email').eq('id', t.parent_id).single()
        if (!p?.email) continue
        if (dates.length === 1) {
          await sendEmail({
            type: 'booking_confirmed', to: p.email, parentName: p.first_name,
            studentName: t.studentName, partnerName: t.partnerName, courseName: hour ? `${ct.name} (60 min)` : ct.name, coachName,
            date: dates[0], time: timeStr,
            location: locs.get(sessOfDate[0] || ''),
          })
        } else {
          await sendEmail({
            type: 'booking_series_confirmed', to: p.email, parentName: p.first_name,
            studentName: t.studentName, partnerName: t.partnerName, courseName: hour ? `${ct.name} (60 min)` : ct.name, coachName,
            dates, time: timeStr,
            locations: locs.size > 0 ? dates.map((_, i) => locs.get(sessOfDate[i] || '')) : undefined,
          })
        }
      }
    } catch {}

    return NextResponse.json({ ok: true, created_count: createdBookingIds.length, dates })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
