import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { isBlocked, type CoachBlock } from '@/lib/availability'
import { getTodayLA, getNowMinutesLA, formatTime12h, minutesUntil } from '@/lib/date'
import { LEAD_TIME_MINUTES } from '@/lib/tokens'
import { sendEmail } from '@/lib/email'
import { priceLesson } from '@/lib/points'
import { applyPoints, InsufficientPoints, walletSummary } from '@/lib/points-wallet'

// Parent-facing weekly recurring 1on4 booking (owner decision 2026-07-24, option a):
// bypasses cart; commit writes confirmed bookings directly (paid in points, no hold).
// preview: ?action=preview  student_id, coach_id, start_time, start_date
//   → every weekly date from start_date through Dec 31 of the current year with status
// commit:  ?action=commit   student_id, coach_id, start_time, dates[]
//   → re-validates each date; books the still-ok ones, skips the rest, reports both

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const addDays = (ds: string, n: number) => {
  const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Cand = { date: string; status: 'ok' | 'full' | 'booked' | 'time_off' | 'no_class' | 'conflict' | 'too_soon'; spots: number }

async function buildCandidates(svc: any, coachId: string, ct: any, studentId: string, level: number, startTime: string, startDate: string): Promise<Cand[]> {
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  // Horizon follows the START DATE's year, not today's: the calendar allows
  // dates up to 60 days out, so a November booking for a January start would
  // otherwise get a horizon already in the past and an empty candidate list.
  const yearEnd = `${startDate.slice(0, 4)}-12-31`
  const dates: string[] = []
  for (let ds = startDate; ds <= yearEnd; ds = addDays(ds, 7)) dates.push(ds)
  if (dates.length === 0) return []

  const startMin = toMin(startTime)
  const endMin = startMin + ct.duration_minutes
  const endTime = minToTime(endMin)

  const [{ data: zrows }, { data: offRows }, { data: sessRows }] = await Promise.all([
    svc.from('coach_availability_zones')
      .select('zone_type, kind, weekday, override_date, start_time, end_time, group_level_min, group_level_max')
      .eq('coach_id', coachId)
      .or(`kind.eq.weekly,and(kind.eq.date,override_date.gte.${startDate},override_date.lte.${yearEnd})`),
    svc.from('coach_time_off')
      .select('coach_id, date, start_time, end_time, block_type')
      .eq('coach_id', coachId).in('date', dates),
    svc.from('class_sessions')
      .select('id, session_date, start_time, end_time, course_type_id, enrolled_count, max_students, status')
      .eq('coach_id', coachId).in('session_date', dates).in('status', ['open', 'full']),
  ])
  if (!zrows || zrows.length === 0) return dates.map(ds => ({ date: ds, status: 'no_class' as const, spots: 0 }))

  const offByDate: Record<string, CoachBlock[]> = {}
  for (const b of offRows || []) (offByDate[b.date] ||= []).push(b as CoachBlock)
  const sessByDate: Record<string, any[]> = {}
  for (const s of sessRows || []) (sessByDate[s.session_date] ||= []).push(s)

  const matchingSessIds: string[] = []
  for (const ds of dates) {
    for (const s of sessByDate[ds] || []) {
      if (toMin(s.start_time) === startMin && s.course_type_id === ct.id) matchingSessIds.push(s.id)
    }
  }
  let bookedSessIds = new Set<string>()
  if (matchingSessIds.length > 0) {
    const { data: myB } = await svc.from('bookings').select('class_session_id')
      .in('class_session_id', matchingSessIds).eq('student_id', studentId)
      .in('status', ['confirmed', 'completed', 'pending_payment', 'in_cart'])
    bookedSessIds = new Set((myB || []).map((b: any) => b.class_session_id))
  }

  return dates.map(ds => {
    if (ds === today && minutesUntil(ds, startTime, today, nowMin) < LEAD_TIME_MINUTES) return { date: ds, status: 'too_soon' as const, spots: 0 }
    const dow = new Date(ds + 'T00:00:00').getDay()
    const dateRows = (zrows || []).filter((r: any) => r.kind === 'date' && r.override_date === ds)
    const picked = dateRows.length > 0 ? dateRows : (zrows || []).filter((r: any) => r.kind === 'weekly' && r.weekday === dow)
    if (picked.some((r: any) => r.zone_type === 'closed')) return { date: ds, status: 'no_class' as const, spots: 0 }
    const z = picked.find((r: any) => r.zone_type === 'group' && toMin(r.start_time) <= startMin && endMin <= toMin(r.end_time))
    if (!z) return { date: ds, status: 'no_class' as const, spots: 0 }
    if (z.group_level_min != null && z.group_level_max != null && (level < z.group_level_min || level > z.group_level_max)) return { date: ds, status: 'no_class' as const, spots: 0 }
    if (isBlocked(offByDate[ds] || [], coachId, startTime, endTime)) return { date: ds, status: 'time_off' as const, spots: 0 }
    const daySess = sessByDate[ds] || []
    const sameSlot = daySess.filter((s: any) => toMin(s.start_time) === startMin)
    const foreign = daySess.find((s: any) => {
      if (s.course_type_id === ct.id || s.enrolled_count <= 0) return false
      const os = toMin(String(s.start_time).slice(0, 5))
      const oe = s.end_time ? toMin(String(s.end_time).slice(0, 5)) : os + 30
      return startMin < oe && endMin > os
    })
    if (foreign) return { date: ds, status: 'conflict' as const, spots: 0 }
    const own = sameSlot.find((s: any) => s.course_type_id === ct.id)
    if (own && bookedSessIds.has(own.id)) return { date: ds, status: 'booked' as const, spots: Math.max(0, own.max_students - own.enrolled_count) }
    const enrolled = own ? own.enrolled_count : 0
    if (enrolled >= ct.max_students) return { date: ds, status: 'full' as const, spots: 0 }
    return { date: ds, status: 'ok' as const, spots: ct.max_students - enrolled }
  })
}

/**
 * Every date in the term, priced on its own. A term runs on one weekday at one
 * time, so in practice every date lands on the same side of the off-peak line --
 * but pricing each one anyway means a term that straddles a schedule change is
 * still billed for what each lesson actually is.
 *
 * The VIP level is the family's level TODAY, applied to the whole term. Pricing
 * later dates at the tier the family will have reached by then would quote a
 * discount they have not earned yet and cannot be held to.
 */
function priceDates(slug: string, dates: string[], startTime: string, lessonsDone: number) {
  const perDate = new Map<string, number>()
  let total = 0
  for (const date of dates) {
    const pr = priceLesson({
      courseSlug: slug, minutes: 30, lessonsCompleted: lessonsDone,
      sessionDate: date, startTime, seats: 1,
    })
    perDate.set(date, pr.perSeat)
    total += pr.perSeat
  }
  return { perDate, total }
}

type SessionRow = { id: string; session_date: string; enrolled_count: number; max_students: number }

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth

  const body = await req.json().catch(() => null)
  if (!body?.action) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { action, student_id, coach_id, start_time } = body
  if (!student_id || !coach_id || !start_time || !TIME_RE.test(start_time))
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })

  const { data: ct } = await svc.from('course_types')
    .select('id, name, slug, duration_minutes, max_students').eq('slug', '1on4').single()
  if (!ct) return NextResponse.json({ error: 'Course type missing' }, { status: 500 })

  const { data: student } = await svc.from('students')
    .select('id, parent_id, full_name, current_level').eq('id', student_id).single()
  if (!student || student.parent_id !== parent.id)
    return NextResponse.json({ error: 'Student not found' }, { status: 403 })
  if (student.current_level == null)
    return NextResponse.json({ error: 'This student must complete a Swim Assessment before booking lessons.' }, { status: 403 })
  const level = Number(student.current_level)

  const today = getTodayLA()

  if (action === 'preview') {
    const { start_date } = body
    if (!start_date || !DATE_RE.test(start_date) || start_date < today)
      return NextResponse.json({ error: 'Invalid start date' }, { status: 400 })
    const candidates = await buildCandidates(svc, coach_id, ct, student.id, level, start_time, start_date)
    const wallet = await walletSummary(svc, parent.id)
    // Price every offered date, so the term picker can total up the selection as
    // the parent ticks dates rather than quoting one figure and charging another.
    const { perDate } = priceDates(ct.slug, candidates.map(c => c.date), start_time, wallet.lessonsCompleted)
    return NextResponse.json({
      candidates: candidates.map(c => ({ ...c, points: perDate.get(c.date) ?? null })),
      balance: wallet.balance,
      vip_level: wallet.vipLevel,
      vip_discount: wallet.vipDiscount,
    })
  }

  if (action === 'commit') {
    const { dates } = body
    if (!Array.isArray(dates) || dates.length < 1 || dates.length > 60 || dates.some((d: any) => typeof d !== 'string' || !DATE_RE.test(d) || d < today))
      return NextResponse.json({ error: 'Invalid dates' }, { status: 400 })
    const sorted = [...dates].sort()
    const candidates = await buildCandidates(svc, coach_id, ct, student.id, level, start_time, sorted[0])
    const statusByDate = new Map(candidates.map(c => [c.date, c.status]))

    const okDates: string[] = []
    const skipped: { date: string; reason: string }[] = []
    for (const d of sorted) {
      const st = statusByDate.get(d)
      if (st === 'ok') okDates.push(d)
      else skipped.push({ date: d, reason: st || 'out_of_range' })
    }
    if (okDates.length === 0)
      return NextResponse.json({ ok: true, booked: 0, booked_dates: [], skipped })

    const wallet = await walletSummary(svc, parent.id)
    const quote = priceDates(ct.slug, okDates, start_time, wallet.lessonsCompleted)
    if (wallet.balance < quote.total)
      return NextResponse.json({ error: 'NOT_ENOUGH_POINTS', needed: quote.total, available: wallet.balance }, { status: 400 })

    const endTime = minToTime(toMin(start_time) + ct.duration_minutes)

    // A term is up to 19 dates. Done one date at a time -- look up the session,
    // create it, settle the credit, write the booking -- that is four round trips
    // each, and the parent watches a spinner for the sum of all of them. The same
    // work in set form is four round trips total: read every session at once,
    // open the missing ones at once, settle every credit at once, write every
    // booking at once.
    const { data: existingRows } = await svc.from('class_sessions')
      .select('id, session_date, enrolled_count, max_students')
      .eq('coach_id', coach_id).eq('course_type_id', ct.id).eq('start_time', start_time)
      .in('session_date', okDates).in('status', ['open', 'full'])
    const openRows = (existingRows || []) as SessionRow[]
    const existingByDate = new Map<string, SessionRow>(openRows.map(r => [r.session_date, r]))

    // Capacity is checked here, off that one read, exactly as it was checked
    // per-date before. A class that fills between this read and the insert below
    // is still the database's problem to catch, as it always was.
    const sessionIdByDate = new Map<string, string>()
    const needSession: string[] = []
    for (const date of okDates) {
      const ex = existingByDate.get(date)
      if (!ex) { needSession.push(date); continue }
      if (ex.enrolled_count + 1 > ex.max_students) { skipped.push({ date, reason: 'full' }); continue }
      sessionIdByDate.set(date, ex.id)
    }

    if (needSession.length > 0) {
      const { data: newSessions, error: sessErr } = await svc.from('class_sessions')
        .insert(needSession.map(date => ({
          coach_id, course_type_id: ct.id, session_date: date, start_time, end_time: endTime,
          max_students: ct.max_students, enrolled_count: 0, status: 'open',
        })))
        .select('id, session_date')
      if (sessErr || !newSessions) {
        return NextResponse.json({ error: `Failed to open the classes: ${sessErr?.message || 'unknown'}` }, { status: 500 })
      }
      for (const r of newSessions as { id: string; session_date: string }[]) sessionIdByDate.set(r.session_date, r.id)
    }

    const bookedDates = okDates.filter(d => sessionIdByDate.has(d))
    if (bookedDates.length === 0)
      return NextResponse.json({ ok: true, booked: 0, booked_dates: [], skipped })

    // Dates can drop out between the quote and here -- a class filling up is the
    // ordinary case -- so the charge is rebuilt from what is actually being
    // booked, never from the earlier total.
    const charge = priceDates(ct.slug, bookedDates, start_time, wallet.lessonsCompleted)

    // One debit for the term, not one per date. A parent's statement should read
    // "19 lessons booked" on the day they booked them, and each booking row still
    // carries its own points so cancelling a single date refunds exactly that
    // date. The per-date figures ride along in the ledger entry.
    try {
      await applyPoints(svc, {
        parentId: parent.id, reason: 'booking', points: -charge.total, actor: 'parent',
        pricing: {
          kind: 'weekly_term', courseSlug: ct.slug, startTime: start_time,
          vipLevel: wallet.vipLevel, vipPct: wallet.vipDiscount,
          dates: bookedDates.map(d => ({ date: d, points: charge.perDate.get(d)! })),
        },
        note: `Weekly term: ${bookedDates.length} lessons`,
      })
    } catch (e: any) {
      if (e instanceof InsufficientPoints)
        return NextResponse.json({ error: 'NOT_ENOUGH_POINTS', needed: e.needed, available: e.available }, { status: 400 })
      console.error('points charge failed:', e)
      return NextResponse.json({ error: 'Could not take the points for this term. Please try again.' }, { status: 500 })
    }

    const refundTerm = (why: string) => applyPoints(svc, {
      parentId: parent.id, reason: 'booking_failed', points: charge.total,
      actor: 'system', note: why,
    }).catch(e => console.error('points rollback failed:', e))

    const { error: bookErr } = await svc.from('bookings')
      .insert(bookedDates.map(date => ({
        class_session_id: sessionIdByDate.get(date)!, parent_id: parent.id,
        student_id: student.id, lesson_credit_id: null,
        points_charged: charge.perDate.get(date)!, status: 'confirmed',
      })))
    if (bookErr) {
      await refundTerm('the term could not be booked')
      return NextResponse.json({ error: `Failed to book the series: ${bookErr.message}` }, { status: 500 })
    }

    try {
      const { data: coach } = await svc.from('coaches').select('first_name, last_name').eq('id', coach_id).single()
      const { data: p } = await svc.from('parents').select('first_name, email').eq('id', parent.id).single()
      if (p?.email && bookedDates.length > 0) {
        await sendEmail({
          type: 'booking_series_confirmed', to: p.email, parentName: p.first_name,
          studentName: student.full_name, courseName: ct.name,
          coachName: coach ? `${coach.first_name} ${coach.last_name || ''}`.trim() : '',
          dates: bookedDates, time: `${formatTime12h(start_time)} \u2013 ${formatTime12h(endTime)}`,
        })
      }
    } catch {}

    return NextResponse.json({ ok: true, booked: bookedDates.length, booked_dates: bookedDates, skipped, points_charged: charge.total })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
