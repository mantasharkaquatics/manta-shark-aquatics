import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { isBlocked, type CoachBlock } from '@/lib/availability'
import { zoneTypeForSlug } from '@/lib/zones'
import { getTodayLA, getNowMinutesLA, formatTime12h, minutesUntil } from '@/lib/date'
import { LEAD_TIME_MINUTES, FIXED_CLASS_MIN_LESSONS, singleMaxDate, SINGLE_TOO_FAR_ERROR } from '@/lib/booking-time'
import { attachVoucher, claimVoucher, releaseVoucher, usableVoucher, VOUCHER_GONE_ERROR, type Voucher } from '@/lib/vouchers'
import { sendEmail } from '@/lib/email'
import { priceLesson } from '@/lib/points'
import { applyPoints, InsufficientPoints, splitGranted, WalletInArrears, walletSummary } from '@/lib/points-wallet'

// Parent-facing batch booking (owner decision 2026-07-24, option a):
// bypasses cart; commit writes confirmed bookings directly (paid in points, no hold).
//
// preview: ?action=preview  student_id, coach_id, start_time, start_date, weeks?
//   → the next `weeks` weekly dates from start_date (default 26) with status --
//     the fixed-class grid. One coach throughout: no substitutes.
// commit:  ?action=commit   student_id, coach_id, slots[{date, start_time, coach_id?, fixed?}]
//   → re-validates each slot; books the still-ok ones, skips the rest, reports both.
//     Slots sharing a `fixed` key are one fixed class (one weekday, time and
//     coach, at least ten lessons; docs/fixed-class-spec.md). If any class
//     would end up under ten, nothing is booked. A slot with no `fixed` key is
//     a single lesson and must fall inside the 14-day window.
//
// commit takes a LIST OF SLOTS, not a weekday rule. A family who wants Monday
// afternoons and Wednesday mornings is describing one set of lessons, not two
// subscriptions, and they should pay for it once: one debit, one confirmation,
// one email. The legacy { dates[], start_time } shape still works and is
// converted to slots at the door.
//
// A batch is one course type. It used to be one coach as well; each slot may
// now carry its own coach_id (falling back to the top-level one), because a
// family who picks times first and does not mind who teaches can end up with
// Mitzi on most weeks and Mitch on the one she is away. Times may differ freely within it,
// and so may length -- a 1-on-1 family may want Tuesdays at 30 minutes and
// Saturdays at 60. What a batch may NOT hold is a cross-family 1-on-2:
// each of those needs the other family to accept inside fifteen minutes, so
// twelve of them is not a batch, it is twelve negotiations. That path stays
// one lesson at a time on purpose.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
// How many weeks the fixed-class grid shows at a time; "show more" asks again
// with a larger number. MAX_WEEKS only keeps one request a sane size.
const DEFAULT_WEEKS = 26
const MAX_WEEKS = 260
const TIME_RE = /^\d{2}:\d{2}$/
const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const addDays = (ds: string, n: number) => {
  const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

type Cand = { date: string; status: 'ok' | 'full' | 'booked' | 'time_off' | 'no_class' | 'conflict' | 'too_soon'; spots: number }

async function buildCandidates(svc: any, coachId: string, ct: any, studentIds: string[], level: number, startTime: string, startDate: string, minutes: number, seats: number, weeks: number = DEFAULT_WEEKS): Promise<Cand[]> {
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  // A fixed class has no end date (owner, 2026-10-01: "you have the points,
  // keep booking"), so the horizon is a number of weeks from the start, not
  // the end of the year -- which had stopped anyone starting a ten-lesson
  // class after late October.
  const dates: string[] = []
  for (let i = 0, ds = startDate; i < weeks; i++, ds = addDays(ds, 7)) dates.push(ds)
  if (dates.length === 0) return []
  const lastDate = dates[dates.length - 1]

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
      .or(`kind.eq.weekly,and(kind.eq.date,override_date.gte.${startDate},override_date.lte.${lastDate})`),
    svc.from('coach_time_off')
      .select('coach_id, date, start_time, end_time, block_type')
      .eq('coach_id', coachId).gte('date', startDate).lte('date', lastDate),
    svc.from('class_sessions')
      .select('id, session_date, start_time, end_time, course_type_id, enrolled_count, max_students, status')
      .eq('coach_id', coachId).gte('session_date', startDate).lte('session_date', lastDate).in('status', ['open', 'full']),
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
      .in('class_session_id', matchingSessIds).in('student_id', studentIds)
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
    // Two siblings in a 1-on-2 need both seats on the SAME date, so a class
    // with one seat left is full for them even though it is open for someone
    // booking alone.
    if (enrolled + seats > ct.max_students) return { date: ds, status: 'full' as const, spots: Math.max(0, ct.max_students - enrolled) }
    return { date: ds, status: 'ok' as const, spots: ct.max_students - enrolled }
  })
}

/**
 * Every date in the term, priced on its own. A term runs on one weekday at one
 * time, so in practice every date lands on the same side of the off-peak line --
 * but pricing each one anyway means a term that straddles a schedule change is
 * still billed for what each lesson actually is.
 */
function priceDates(slug: string, dates: string[], startTime: string, minutes: number, seats: number) {
  const perDate = new Map<string, number>()
  let total = 0
  for (const date of dates) {
    const pr = priceLesson({
      courseSlug: slug, minutes,
      sessionDate: date, startTime, seats,
    })
    // What the family pays for that date. Two siblings in one lesson are one
    // number on the grid, because they are one decision and one charge.
    perDate.set(date, pr.charged)
    total += pr.charged
  }
  return { perDate, total }
}

// `fixed` names the fixed class a slot belongs to (any string the client
// chose, shared by that class's dates); a slot without one is a single lesson.
type Slot = { date: string; time: string; coach?: string; fixed?: string }
const slotKey = (s: Slot) => `${s.date}|${s.time}${s.coach ? `|${s.coach}` : ''}`

/**
 * The same per-lesson pricing, for a selection whose lessons need not share a
 * time. Off-peak is decided by the time a lesson STARTS, so a batch spanning a
 * morning slot and an afternoon one has two different prices in it and must be
 * priced slot by slot -- averaging or taking the first would quote a figure no
 * single lesson costs.
 */
function priceSlots(slug: string, slots: Slot[], minutes: number, seats: number) {
  // perSlot is what the LESSON costs the family (both seats of a sibling
  // 1-on-2); perSeat is what one booking row carries, so cancelling one
  // swimmer refunds exactly that swimmer.
  const perSlot = new Map<string, number>()
  const perSeat = new Map<string, number>()
  let total = 0
  for (const s of slots) {
    const pr = priceLesson({
      courseSlug: slug, minutes,
      sessionDate: s.date, startTime: s.time, seats,
    })
    perSlot.set(slotKey(s), pr.charged)
    perSeat.set(slotKey(s), pr.perSeat)
    total += pr.charged
  }
  return { perSlot, perSeat, total }
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
  // minutes, and cannot be batched -- so the only 1-on-2 this endpoint books is
  // two swimmers on the REQUESTING account, both seats paid here. A 1-on-2 with
  // one swimmer would be half a cross-family booking with no other family in
  // it, so it is refused rather than quietly sold.
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

  let student2: { id: string; full_name: string } | null = null
  if (course_slug === '1on2') {
    const id2 = body.student2_id
    if (typeof id2 !== 'string' || !id2 || id2 === student_id)
      return NextResponse.json({ error: 'A 1-on-2 booked here needs two swimmers on your account.' }, { status: 400 })
    const { data: s2 } = await svc.from('students')
      .select('id, parent_id, full_name, current_level').eq('id', id2).single()
    if (!s2 || s2.parent_id !== parent.id)
      return NextResponse.json({ error: 'Student not found' }, { status: 403 })
    if (s2.current_level == null)
      return NextResponse.json({ error: 'This student must complete a Swim Assessment before booking lessons.' }, { status: 403 })
    student2 = { id: s2.id, full_name: s2.full_name }
  }
  const studentIds = student2 ? [student.id, student2.id] : [student.id]
  const seats = studentIds.length

  const today = getTodayLA()

  if (action === 'preview') {
    const { start_date } = body
    if (!start_date || !DATE_RE.test(start_date) || start_date < today)
      return NextResponse.json({ error: 'Invalid start date' }, { status: 400 })
    const weeks = Math.min(MAX_WEEKS, Math.max(1, Math.floor(Number(body.weeks) || DEFAULT_WEEKS)))
    // The grid is the fixed class, and a fixed class is one coach (owner,
    // 2026-10-01). A week that coach cannot teach is shown as such and left
    // out -- it is not offered with someone else, and it is not charged.
    const candidates: (Cand & { coach_id?: string })[] =
      await buildCandidates(svc, coach_id, ct, studentIds, level, start_time, start_date, minutes, seats, weeks)
    for (const c of candidates) c.coach_id = coach_id
    const wallet = await walletSummary(svc, parent.id)
    // Price every offered date, so the term picker can total up the selection as
    // the parent ticks dates rather than quoting one figure and charging another.
    const { perDate } = priceDates(ct.slug, candidates.map(c => c.date), start_time, minutes, seats)
    return NextResponse.json({
      candidates: candidates.map(c => ({ ...c, points: perDate.get(c.date) ?? null })),
      balance: wallet.balance,
    })
  }

  if (action === 'commit') {
    // Either shape arrives here; both leave as a list of slots.
    const raw: any[] = Array.isArray(body.slots)
      ? body.slots
      : (Array.isArray(body.dates) ? body.dates.map((d: any) => ({ date: d, start_time })) : [])
    if (raw.length < 1 || raw.length > MAX_WEEKS * 2)
      return NextResponse.json({ error: 'Invalid slots' }, { status: 400 })
    const singleMax = singleMaxDate(today)

    // A make-up lesson: one lesson, paid with a voucher instead of points
    // (docs/fixed-class-spec.md section 3). Same course, same child (or the
    // same two children of a sibling 1-on-2), on or before the voucher's date
    // -- which may be further out than the 14-day window, since the voucher is
    // the family's to use for four weeks.
    let voucher: Voucher | null = null
    if (typeof body.voucher_id === 'string' && body.voucher_id) {
      voucher = await usableVoucher(svc, body.voucher_id, parent.id, today)
      if (!voucher) return NextResponse.json({ error: VOUCHER_GONE_ERROR }, { status: 400 })
      const want = new Set(studentIds)
      const has = new Set([voucher.student_id, voucher.student2_id].filter(Boolean) as string[])
      if (voucher.course_slug !== ct.slug || voucher.minutes !== minutes
          || want.size !== has.size || [...want].some(id => !has.has(id)))
        return NextResponse.json({ error: 'This make-up voucher is for a different lesson.' }, { status: 400 })
      if (raw.length !== 1 || raw[0]?.fixed)
        return NextResponse.json({ error: 'A make-up voucher books one lesson.' }, { status: 400 })
      if (typeof raw[0]?.date === 'string' && raw[0].date > voucher.expires_on)
        return NextResponse.json({ error: 'That date is after this make-up voucher expires.' }, { status: 400 })
    }

    const seen = new Set<string>()
    const wanted: Slot[] = []
    for (const r of raw) {
      const date = r?.date, time = r?.start_time
      const coach = typeof r?.coach_id === 'string' && r.coach_id ? r.coach_id : coach_id
      if (typeof date !== 'string' || !DATE_RE.test(date) || date < today)
        return NextResponse.json({ error: 'Invalid slots' }, { status: 400 })
      if (typeof time !== 'string' || !TIME_RE.test(time))
        return NextResponse.json({ error: 'Invalid slots' }, { status: 400 })
      const fixed = typeof r?.fixed === 'string' && r.fixed ? r.fixed.slice(0, 80) : undefined
      // Only a fixed class books past the single-lesson window.
      if (!fixed && !voucher && date > singleMax)
        return NextResponse.json({ error: SINGLE_TOO_FAR_ERROR }, { status: 400 })
      const k = `${date}|${time}|${coach}`
      if (seen.has(k)) continue
      seen.add(k)
      wanted.push({ date, time, coach, fixed })
    }
    wanted.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))

    // A fixed class is one weekday, one time, one coach, and at least ten
    // lessons. The client builds it that way; this is the server not taking
    // its word for it.
    const weekdayOf = (d: string) => new Date(d + 'T00:00:00').getDay()
    const groups = new Map<string, Slot[]>()
    for (const w of wanted) if (w.fixed) groups.set(w.fixed, [...(groups.get(w.fixed) || []), w])
    for (const [, g] of groups) {
      const f = g[0]
      if (g.some(x => x.time !== f.time || x.coach !== f.coach || weekdayOf(x.date) !== weekdayOf(f.date)))
        return NextResponse.json({ error: 'Invalid slots' }, { status: 400 })
      if (g.length < FIXED_CLASS_MIN_LESSONS)
        return NextResponse.json({ error: 'FIXED_TOO_FEW', need: FIXED_CLASS_MIN_LESSONS, have: g.length }, { status: 400 })
    }
    // Every class still has its ten after the lessons that could not be booked
    // have dropped out -- or nothing is booked and nothing is charged. Half a
    // fixed class is not a smaller fixed class, it is a broken promise.
    const shortGroup = (slots: Slot[]) => {
      for (const [key] of groups) {
        const have = slots.filter(x => x.fixed === key).length
        if (have < FIXED_CLASS_MIN_LESSONS) return { have }
      }
      return null
    }

    const coachIds = [...new Set(wanted.map(w => w.coach!))]
    const { data: coachRows } = await svc.from('coaches').select('id, first_name, last_name, is_active').in('id', coachIds)
    const coachById = new Map<string, any>((coachRows || []).map((c: any) => [c.id, c]))
    if (coachIds.some(id => !coachById.get(id)?.is_active))
      return NextResponse.json({ error: 'Invalid slots' }, { status: 400 })

    // Availability is read per distinct coach and time -- a handful of passes,
    // not one per lesson -- and every slot is re-checked against what came
    // back, because the parent may have been choosing for several minutes.
    const times = [...new Set(wanted.map(w => w.time))]
    const statusByKey = new Map<string, string>()
    for (const cid of coachIds) {
      for (const t of times) {
        const mine = wanted.filter(w => w.time === t && w.coach === cid)
        if (mine.length === 0) continue
        const ds = mine.map(w => w.date).sort()
        const first = ds[0]
        const span = Math.round((Date.parse(ds[ds.length - 1]) - Date.parse(first)) / 86400000 / 7) + 1
        const cands = await buildCandidates(svc, cid, ct, studentIds, level, t, first, minutes, seats, Math.min(MAX_WEEKS, span))
        for (const c of cands) statusByKey.set(`${c.date}|${t}|${cid}`, c.status)
      }
    }

    const okSlots: Slot[] = []
    const skipped: { date: string; start_time: string; reason: string }[] = []
    for (const w of wanted) {
      const st = statusByKey.get(slotKey(w))
      if (st === 'ok') okSlots.push(w)
      else skipped.push({ date: w.date, start_time: w.time, reason: st || 'out_of_range' })
    }
    {
      const short = shortGroup(okSlots)
      if (short) return NextResponse.json({ error: 'FIXED_TOO_FEW', need: FIXED_CLASS_MIN_LESSONS, have: short.have, skipped }, { status: 409 })
    }
    if (okSlots.length === 0)
      return NextResponse.json({ ok: true, booked: 0, booked_slots: [], booked_dates: [], skipped })

    if (!voucher) {
      const wallet = await walletSummary(svc, parent.id)
      // A wallet in arrears can still show a positive total when it holds
      // granted points, so this has to be asked before the balance question --
      // otherwise the parent is told to buy more points when what they need to
      // do is settle a payment that came back.
      if (wallet.arrears > 0)
        return NextResponse.json({ error: 'WALLET_IN_ARREARS', owed: wallet.arrears }, { status: 402 })
      const quote = priceSlots(ct.slug, okSlots, minutes, seats)
      if (wallet.balance < quote.total)
        return NextResponse.json({ error: 'NOT_ENOUGH_POINTS', needed: quote.total, available: wallet.balance }, { status: 400 })
    }

    const endOf = (t: string) => minToTime(toMin(t) + minutes)

    // Up to 60 slots. Done one at a time -- look up the session, create it,
    // settle the points, write the booking -- that is four round trips each, and
    // the parent watches a spinner for the sum of all of them. The same work in
    // set form is four round trips total.
    const { data: existingRows } = await svc.from('class_sessions')
      .select('id, coach_id, session_date, start_time, enrolled_count, max_students')
      .in('coach_id', coachIds).eq('course_type_id', ct.id)
      .in('start_time', times)
      .in('session_date', [...new Set(okSlots.map(s2 => s2.date))])
      .in('status', ['open', 'full'])
    const existingByKey = new Map<string, SessionRow>()
    for (const r of (existingRows || []) as (SessionRow & { coach_id: string })[]) {
      existingByKey.set(`${r.session_date}|${String(r.start_time).slice(0, 5)}|${r.coach_id}`, r)
    }

    // Capacity is checked here, off that one read. A class that fills between
    // this read and the insert below is still the database's problem to catch,
    // as it always was.
    const sessionIdByKey = new Map<string, string>()
    const needSession: Slot[] = []
    for (const s2 of okSlots) {
      const ex = existingByKey.get(slotKey(s2))
      if (!ex) { needSession.push(s2); continue }
      if (ex.enrolled_count + seats > ex.max_students) { skipped.push({ date: s2.date, start_time: s2.time, reason: 'full' }); continue }
      sessionIdByKey.set(slotKey(s2), ex.id)
    }

    if (needSession.length > 0) {
      const { data: newSessions, error: sessErr } = await svc.from('class_sessions')
        .insert(needSession.map(s2 => ({
          coach_id: s2.coach, course_type_id: ct.id, session_date: s2.date,
          start_time: s2.time, end_time: endOf(s2.time),
          max_students: ct.max_students, enrolled_count: 0, status: 'open',
        })))
        .select('id, coach_id, session_date, start_time')
      if (sessErr || !newSessions) {
        return NextResponse.json({ error: `Failed to open the classes: ${sessErr?.message || 'unknown'}` }, { status: 500 })
      }
      for (const r of newSessions as { id: string; coach_id: string; session_date: string; start_time: string }[]) {
        sessionIdByKey.set(`${r.session_date}|${String(r.start_time).slice(0, 5)}|${r.coach_id}`, r.id)
      }
    }

    const booked = okSlots.filter(s2 => sessionIdByKey.has(slotKey(s2)))
    {
      const short = shortGroup(booked)
      if (short) return NextResponse.json({ error: 'FIXED_TOO_FEW', need: FIXED_CLASS_MIN_LESSONS, have: short.have, skipped }, { status: 409 })
    }
    if (booked.length === 0)
      return NextResponse.json({ ok: true, booked: 0, booked_slots: [], booked_dates: [], skipped })

    // The fixed classes themselves, before any points move: if this fails,
    // nothing has been charged and nothing needs undoing.
    const fixedIdByKey = new Map<string, string>()
    if (groups.size > 0) {
      const keys = [...groups.keys()]
      const { data: fcRows, error: fcErr } = await svc.from('fixed_classes')
        .insert(keys.map(k => {
          const f = groups.get(k)![0]
          return {
            parent_id: parent.id, student_id: student.id, student2_id: student2?.id ?? null,
            course_type_id: ct.id, minutes, coach_id: f.coach, weekday: weekdayOf(f.date), start_time: f.time,
          }
        }))
        .select('id')
      if (fcErr || !fcRows || fcRows.length !== keys.length)
        return NextResponse.json({ error: `Failed to set up the fixed class: ${fcErr?.message || 'unknown'}` }, { status: 500 })
      keys.forEach((k, i) => fixedIdByKey.set(k, (fcRows as { id: string }[])[i].id))
    }
    const dropFixed = async () => {
      if (fixedIdByKey.size === 0) return
      const { error } = await svc.from('fixed_classes').delete().in('id', [...fixedIdByKey.values()])
      if (error) console.error('fixed class rollback failed:', error)
    }

    // Slots can drop out between the quote and here -- a class filling up is the
    // ordinary case -- so the charge is rebuilt from what is actually being
    // booked, never from the earlier total.
    if (voucher) {
      // The voucher is taken first -- conditionally, so two tabs cannot both
      // spend it -- and given back if the lesson cannot be written.
      const claimed = await claimVoucher(svc, voucher.id, parent.id, today)
      if (!claimed) return NextResponse.json({ error: VOUCHER_GONE_ERROR }, { status: 409 })
      const s0 = booked[0]
      const { data: rowsIn, error: vErr } = await svc.from('bookings')
        .insert(studentIds.map(sid => ({
          class_session_id: sessionIdByKey.get(slotKey(s0))!, parent_id: parent.id,
          student_id: sid, lesson_credit_id: null, points_charged: 0, status: 'confirmed',
          points_granted: 0, voucher_id: voucher!.id,
        })))
        .select('id')
      if (vErr || !rowsIn || rowsIn.length === 0) {
        await releaseVoucher(svc, voucher.id)
        return NextResponse.json({ error: `Failed to book the lesson: ${vErr?.message || 'unknown'}` }, { status: 500 })
      }
      await attachVoucher(svc, voucher.id, (rowsIn as { id: string }[])[0].id)
      try {
        const coach = coachById.get(s0.coach!)
        const { data: p2 } = await svc.from('parents').select('first_name, email').eq('id', parent.id).single()
        if (p2?.email) {
          await sendEmail({
            type: 'booking_confirmed', to: p2.email, parentName: p2.first_name,
            studentName: student2 ? `${student.full_name} & ${student2.full_name}` : student.full_name,
            courseName: ct.name, coachName: coach ? `${coach.first_name} ${coach.last_name || ''}`.trim() : '',
            date: s0.date, time: `${formatTime12h(s0.time)} – ${formatTime12h(endOf(s0.time))}`,
          })
        }
      } catch {}
      return NextResponse.json({
        ok: true, booked: 1, make_up: true,
        booked_slots: [{ date: s0.date, start_time: s0.time, coach_id: s0.coach, points: 0 }],
        booked_dates: [s0.date], skipped, points_charged: 0,
      })
    }

    const charge = priceSlots(ct.slug, booked, minutes, seats)
    const uniformTime = times.length === 1 ? times[0] : null

    // One debit for the batch, not one per lesson. A parent's statement should
    // read "8 lessons booked" on the day they booked them, and each booking row
    // still carries its own points so cancelling one date refunds exactly that
    // date. The per-lesson figures ride along in the ledger entry.
    let paid
    try {
      paid = await applyPoints(svc, {
        parentId: parent.id, reason: 'booking', points: -charge.total, actor: 'parent',
        pricing: uniformTime
          ? {
              kind: 'weekly_term', courseSlug: ct.slug, startTime: uniformTime,
              dates: booked.map(s2 => ({ date: s2.date, points: charge.perSlot.get(slotKey(s2))! })),
            }
          : {
              kind: 'multi_slot', courseSlug: ct.slug,
              slots: booked.map(s2 => ({ date: s2.date, startTime: s2.time, points: charge.perSlot.get(slotKey(s2))! })),
            },
        note: `${booked.length} lessons booked`,
      })
    } catch (e: any) {
      await dropFixed()
      if (e instanceof WalletInArrears)
        return NextResponse.json({ error: 'WALLET_IN_ARREARS', owed: e.owed }, { status: 402 })
      if (e instanceof InsufficientPoints)
        return NextResponse.json({ error: 'NOT_ENOUGH_POINTS', needed: e.needed, available: e.available }, { status: 400 })
      console.error('points charge failed:', e)
      return NextResponse.json({ error: 'Could not take the points for these lessons. Please try again.' }, { status: 500 })
    }

    const refundBatch = (why: string) => applyPoints(svc, {
      parentId: parent.id, reason: 'booking_failed', points: charge.total,
      grantedPart: paid.grantedTaken, grantedExpiresAt: paid.grantedExpiresAt,
      actor: 'system', note: why,
    }).catch(e => console.error('points rollback failed:', e))

    // The rows, in lesson order, and each one's share of any granted points
    // the debit used -- the earliest lessons take them first.
    const rowSpecs = booked.flatMap(s2 => studentIds.map(sid => ({ s2, sid, points: charge.perSeat.get(slotKey(s2))! })))
    const rowGranted = splitGranted(paid.grantedTaken, rowSpecs.map(r => r.points))

    // One row per swimmer per lesson. Both seats were paid in the single debit
    // above, but each row carries its own seat's points so cancelling one
    // sibling's lesson refunds that seat and leaves the other standing.
    const { error: bookErr } = await svc.from('bookings')
      .insert(rowSpecs.map(({ s2, sid, points }, i) => ({
        class_session_id: sessionIdByKey.get(slotKey(s2))!, parent_id: parent.id,
        student_id: sid, lesson_credit_id: null,
        points_charged: points, status: 'confirmed',
        points_granted: rowGranted[i],
        points_granted_expires_at: rowGranted[i] > 0 ? paid.grantedExpiresAt : null,
        fixed_class_id: s2.fixed ? fixedIdByKey.get(s2.fixed) ?? null : null,
      })))
    if (bookErr) {
      await refundBatch('the lessons could not be booked')
      await dropFixed()
      return NextResponse.json({ error: `Failed to book the lessons: ${bookErr.message}` }, { status: 500 })
    }

    try {
      const bookedCoaches = [...new Set(booked.map(s2 => s2.coach!))].map(id => coachById.get(id)).filter(Boolean)
      const { data: p2 } = await svc.from('parents').select('first_name, email').eq('id', parent.id).single()
      if (p2?.email) {
        await sendEmail({
          type: 'booking_series_confirmed', to: p2.email, parentName: p2.first_name,
          studentName: student2 ? `${student.full_name} & ${student2.full_name}` : student.full_name, courseName: ct.name,
          coachName: bookedCoaches.map((c: any) => `${c.first_name} ${c.last_name || ''}`.trim()).join(' / '),
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
      booked_slots: booked.map(s2 => ({ date: s2.date, start_time: s2.time, coach_id: s2.coach, points: charge.perSlot.get(slotKey(s2))! })),
      booked_dates: booked.map(s2 => s2.date),
      skipped,
      points_charged: charge.total,
      fixed_classes: fixedIdByKey.size,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
