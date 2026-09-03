import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { isBlocked, type CoachBlock } from '@/lib/availability'
import { zoneTypeForSlug } from '@/lib/zones'
import { getTodayLA, getNowMinutesLA, formatTime12h, minutesUntil } from '@/lib/date'
import { LEAD_TIME_MINUTES } from '@/lib/booking-time'
import { sendEmail } from '@/lib/email'
import { priceLesson } from '@/lib/points'
import { applyPoints, InsufficientPoints, walletSummary } from '@/lib/points-wallet'

// Parent-facing batch booking (owner decision 2026-07-24, option a):
// bypasses cart; commit writes confirmed bookings directly (paid in points, no hold).
//
// preview: ?action=preview  student_id, coach_id, start_time, start_date
//   → every weekly date from start_date through Dec 31 of the current year with status
// commit:  ?action=commit   student_id, coach_id, slots[{date, start_time}]
//   → re-validates each slot; books the still-ok ones, skips the rest, reports both
//
// commit takes a LIST OF SLOTS, not a weekday rule. A family who wants Monday
// afternoons and Wednesday mornings is describing one set of lessons, not two
// subscriptions, and they should pay for it once: one debit, one confirmation,
// one email. The legacy { dates[], start_time } shape still works and is
// converted to slots at the door.
//
// A batch is one coach and one course type. Times may differ freely within it,
// and so may length -- a 1-on-1 family may want Tuesdays at 30 minutes and
// Saturdays at 60. What a batch may NOT hold is a cross-family 1-on-2:
// each of those needs the other family to accept inside fifteen minutes, so
// twelve of them is not a batch, it is twelve negotiations. That path stays
// one lesson at a time on purpose.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}$/
const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const addDays = (ds: string, n: number) => {
  const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Cand = { date: string; status: 'ok' | 'full' | 'booked' | 'time_off' | 'no_class' | 'conflict' | 'too_soon'; spots: number }

async function buildCandidates(svc: any, coachId: string, ct: any, studentId: string, level: number, startTime: string, startDate: string, minutes: number): Promise<Cand[]> {
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
  const endMin = startMin + minutes
  const endTime = minToTime(endMin)
  // Which kind of zone has to cover this slot. A private lesson asked against
  // the group zone would be refused on every date the coach teaches privately,
  // which is every date it should have been offered on.
  const zoneType = zoneTypeForSlug(ct.slug)

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
  // A coach with no zone rows at all is on the old availability model, and
  // create/route.ts lets those through without a zone check. Refusing them here
  // would have hidden every date for a coach whose calendar is perfectly fine.
  const legacyCoach = !zrows || zrows.length === 0

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
    if (!legacyCoach) {
      if (picked.some((r: any) => r.zone_type === 'closed')) return { date: ds, status: 'no_class' as const, spots: 0 }
      const z = picked.find((r: any) => r.zone_type === zoneType && toMin(r.start_time) <= startMin && endMin <= toMin(r.end_time))
      if (!z) return { date: ds, status: 'no_class' as const, spots: 0 }
      // The level band belongs to group zones; a private zone has no band and
      // must not be judged against one.
      if (zoneType === 'group' && z.group_level_min != null && z.group_level_max != null
          && (level < z.group_level_min || level > z.group_level_max)) return { date: ds, status: 'no_class' as const, spots: 0 }
    }
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
function priceDates(slug: string, dates: string[], startTime: string, lessonsDone: number, minutes: number) {
  const perDate = new Map<string, number>()
  let total = 0
  for (const date of dates) {
    const pr = priceLesson({
      courseSlug: slug, minutes, lessonsCompleted: lessonsDone,
      sessionDate: date, startTime, seats: 1,
    })
    perDate.set(date, pr.perSeat)
    total += pr.perSeat
  }
  return { perDate, total }
}

type Slot = { date: string; time: string }
const slotKey = (s: Slot) => `${s.date}|${s.time}`

/**
 * The same per-lesson pricing, for a selection whose lessons need not share a
 * time. Off-peak is decided by the time a lesson STARTS, so a batch spanning a
 * morning slot and an afternoon one has two different prices in it and must be
 * priced slot by slot -- averaging or taking the first would quote a figure no
 * single lesson costs.
 */
function priceSlots(slug: string, slots: Slot[], lessonsDone: number, minutes: number) {
  const perSlot = new Map<string, number>()
  let total = 0
  for (const s of slots) {
    const pr = priceLesson({
      courseSlug: slug, minutes, lessonsCompleted: lessonsDone,
      sessionDate: s.date, startTime: s.time, seats: 1,
    })
    perSlot.set(slotKey(s), pr.perSeat)
    total += pr.perSeat
  }
  return { perSlot, total }
}

type SessionRow = { id: string; session_date: string; start_time: string; enrolled_count: number; max_students: number }

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { parent, svc } = auth

  const body = await req.json().catch(() => null)
  if (!body?.action) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { action, student_id, coach_id, start_time } = body
  if (!student_id || !coach_id)
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  // preview is still "one weekday at one time"; commit carries its times per slot.
  if (start_time != null && !TIME_RE.test(start_time))
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  if (action === 'preview' && !start_time)
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })

  // Which course this batch is for. Defaults to the group class, so callers
  // written before this endpoint learned about the others keep working.
  const course_slug = typeof body.course_slug === 'string' ? body.course_slug : '1on4'
  if (!['1on1', '1on2', '1on4'].includes(course_slug))
    return NextResponse.json({ error: 'Unsupported course type' }, { status: 400 })
  // A cross-family 1-on-2 settles when the OTHER family accepts, inside fifteen
  // minutes. That cannot be batched, so this endpoint only ever books a 1-on-2
  // for one swimmer on the requesting account.
  const { data: ct } = await svc.from('course_types')
    .select('id, name, slug, duration_minutes, max_students').eq('slug', course_slug).single()
  if (!ct) return NextResponse.json({ error: 'Course type missing' }, { status: 500 })

  // 1-on-1 runs 30 or 60; a group class is whatever the course type says.
  const minutes = course_slug === '1on1' && Number(body.minutes) === 60 ? 60 : ct.duration_minutes
  if (![30, 60].includes(minutes))
    return NextResponse.json({ error: 'Unsupported lesson length' }, { status: 400 })

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
    const candidates = await buildCandidates(svc, coach_id, ct, student.id, level, start_time, start_date, minutes)
    const wallet = await walletSummary(svc, parent.id)
    // Price every offered date, so the term picker can total up the selection as
    // the parent ticks dates rather than quoting one figure and charging another.
    const { perDate } = priceDates(ct.slug, candidates.map(c => c.date), start_time, wallet.lessonsCompleted, minutes)
    return NextResponse.json({
      candidates: candidates.map(c => ({ ...c, points: perDate.get(c.date) ?? null })),
      balance: wallet.balance,
      vip_level: wallet.vipLevel,
      vip_discount: wallet.vipDiscount,
    })
  }

  if (action === 'commit') {
    // Either shape arrives here; both leave as a list of slots.
    const raw: any[] = Array.isArray(body.slots)
      ? body.slots
      : (Array.isArray(body.dates) ? body.dates.map((d: any) => ({ date: d, start_time })) : [])
    if (raw.length < 1 || raw.length > 60)
      return NextResponse.json({ error: 'Invalid slots' }, { status: 400 })

    const seen = new Set<string>()
    const wanted: Slot[] = []
    for (const r of raw) {
      const date = r?.date, time = r?.start_time
      if (typeof date !== 'string' || !DATE_RE.test(date) || date < today)
        return NextResponse.json({ error: 'Invalid slots' }, { status: 400 })
      if (typeof time !== 'string' || !TIME_RE.test(time))
        return NextResponse.json({ error: 'Invalid slots' }, { status: 400 })
      const k = `${date}|${time}`
      if (seen.has(k)) continue
      seen.add(k)
      wanted.push({ date, time })
    }
    wanted.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

    // Availability is read per distinct time -- a handful of passes, not one per
    // lesson -- and every slot is re-checked against what came back, because the
    // parent may have been choosing for several minutes.
    const times = [...new Set(wanted.map(w => w.time))]
    const statusByKey = new Map<string, string>()
    for (const t of times) {
      const first = wanted.filter(w => w.time === t).map(w => w.date).sort()[0]
      const cands = await buildCandidates(svc, coach_id, ct, student.id, level, t, first, minutes)
      for (const c of cands) statusByKey.set(`${c.date}|${t}`, c.status)
    }

    const okSlots: Slot[] = []
    const skipped: { date: string; start_time: string; reason: string }[] = []
    for (const w of wanted) {
      const st = statusByKey.get(slotKey(w))
      if (st === 'ok') okSlots.push(w)
      else skipped.push({ date: w.date, start_time: w.time, reason: st || 'out_of_range' })
    }
    if (okSlots.length === 0)
      return NextResponse.json({ ok: true, booked: 0, booked_slots: [], booked_dates: [], skipped })

    const wallet = await walletSummary(svc, parent.id)
    const quote = priceSlots(ct.slug, okSlots, wallet.lessonsCompleted, minutes)
    if (wallet.balance < quote.total)
      return NextResponse.json({ error: 'NOT_ENOUGH_POINTS', needed: quote.total, available: wallet.balance }, { status: 400 })

    const endOf = (t: string) => minToTime(toMin(t) + minutes)

    // Up to 60 slots. Done one at a time -- look up the session, create it,
    // settle the points, write the booking -- that is four round trips each, and
    // the parent watches a spinner for the sum of all of them. The same work in
    // set form is four round trips total.
    const { data: existingRows } = await svc.from('class_sessions')
      .select('id, session_date, start_time, enrolled_count, max_students')
      .eq('coach_id', coach_id).eq('course_type_id', ct.id)
      .in('start_time', times)
      .in('session_date', [...new Set(okSlots.map(s2 => s2.date))])
      .in('status', ['open', 'full'])
    const existingByKey = new Map<string, SessionRow>()
    for (const r of (existingRows || []) as SessionRow[]) {
      existingByKey.set(`${r.session_date}|${String(r.start_time).slice(0, 5)}`, r)
    }

    // Capacity is checked here, off that one read. A class that fills between
    // this read and the insert below is still the database's problem to catch,
    // as it always was.
    const sessionIdByKey = new Map<string, string>()
    const needSession: Slot[] = []
    for (const s2 of okSlots) {
      const ex = existingByKey.get(slotKey(s2))
      if (!ex) { needSession.push(s2); continue }
      if (ex.enrolled_count + 1 > ex.max_students) { skipped.push({ date: s2.date, start_time: s2.time, reason: 'full' }); continue }
      sessionIdByKey.set(slotKey(s2), ex.id)
    }

    if (needSession.length > 0) {
      const { data: newSessions, error: sessErr } = await svc.from('class_sessions')
        .insert(needSession.map(s2 => ({
          coach_id, course_type_id: ct.id, session_date: s2.date,
          start_time: s2.time, end_time: endOf(s2.time),
          max_students: ct.max_students, enrolled_count: 0, status: 'open',
        })))
        .select('id, session_date, start_time')
      if (sessErr || !newSessions) {
        return NextResponse.json({ error: `Failed to open the classes: ${sessErr?.message || 'unknown'}` }, { status: 500 })
      }
      for (const r of newSessions as { id: string; session_date: string; start_time: string }[]) {
        sessionIdByKey.set(`${r.session_date}|${String(r.start_time).slice(0, 5)}`, r.id)
      }
    }

    const booked = okSlots.filter(s2 => sessionIdByKey.has(slotKey(s2)))
    if (booked.length === 0)
      return NextResponse.json({ ok: true, booked: 0, booked_slots: [], booked_dates: [], skipped })

    // Slots can drop out between the quote and here -- a class filling up is the
    // ordinary case -- so the charge is rebuilt from what is actually being
    // booked, never from the earlier total.
    const charge = priceSlots(ct.slug, booked, wallet.lessonsCompleted, minutes)
    const uniformTime = times.length === 1 ? times[0] : null

    // One debit for the batch, not one per lesson. A parent's statement should
    // read "8 lessons booked" on the day they booked them, and each booking row
    // still carries its own points so cancelling one date refunds exactly that
    // date. The per-lesson figures ride along in the ledger entry.
    try {
      await applyPoints(svc, {
        parentId: parent.id, reason: 'booking', points: -charge.total, actor: 'parent',
        pricing: uniformTime
          ? {
              kind: 'weekly_term', courseSlug: ct.slug, startTime: uniformTime,
              vipLevel: wallet.vipLevel, vipPct: wallet.vipDiscount,
              dates: booked.map(s2 => ({ date: s2.date, points: charge.perSlot.get(slotKey(s2))! })),
            }
          : {
              kind: 'multi_slot', courseSlug: ct.slug,
              vipLevel: wallet.vipLevel, vipPct: wallet.vipDiscount,
              slots: booked.map(s2 => ({ date: s2.date, startTime: s2.time, points: charge.perSlot.get(slotKey(s2))! })),
            },
        note: `${booked.length} lessons booked`,
      })
    } catch (e: any) {
      if (e instanceof InsufficientPoints)
        return NextResponse.json({ error: 'NOT_ENOUGH_POINTS', needed: e.needed, available: e.available }, { status: 400 })
      console.error('points charge failed:', e)
      return NextResponse.json({ error: 'Could not take the points for these lessons. Please try again.' }, { status: 500 })
    }

    const refundBatch = (why: string) => applyPoints(svc, {
      parentId: parent.id, reason: 'booking_failed', points: charge.total,
      actor: 'system', note: why,
    }).catch(e => console.error('points rollback failed:', e))

    const { error: bookErr } = await svc.from('bookings')
      .insert(booked.map(s2 => ({
        class_session_id: sessionIdByKey.get(slotKey(s2))!, parent_id: parent.id,
        student_id: student.id, lesson_credit_id: null,
        points_charged: charge.perSlot.get(slotKey(s2))!, status: 'confirmed',
      })))
    if (bookErr) {
      await refundBatch('the lessons could not be booked')
      return NextResponse.json({ error: `Failed to book the lessons: ${bookErr.message}` }, { status: 500 })
    }

    try {
      const { data: coach } = await svc.from('coaches').select('first_name, last_name').eq('id', coach_id).single()
      const { data: p2 } = await svc.from('parents').select('first_name, email').eq('id', parent.id).single()
      if (p2?.email) {
        await sendEmail({
          type: 'booking_series_confirmed', to: p2.email, parentName: p2.first_name,
          studentName: student.full_name, courseName: ct.name,
          coachName: coach ? `${coach.first_name} ${coach.last_name || ''}`.trim() : '',
          dates: booked.map(s2 => s2.date),
          // With one time the email keeps its single Time row; with several it
          // has to say the time on every line, or it is telling the family the
          // wrong hour for half their lessons.
          times: uniformTime ? undefined : booked.map(s2 => `${formatTime12h(s2.time)} – ${formatTime12h(endOf(s2.time))}`),
          time: uniformTime ? `${formatTime12h(uniformTime)} – ${formatTime12h(endOf(uniformTime))}` : undefined,
        })
      }
    } catch {}

    return NextResponse.json({
      ok: true,
      booked: booked.length,
      booked_slots: booked.map(s2 => ({ date: s2.date, start_time: s2.time, points: charge.perSlot.get(slotKey(s2))! })),
      booked_dates: booked.map(s2 => s2.date),
      skipped,
      points_charged: charge.total,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
