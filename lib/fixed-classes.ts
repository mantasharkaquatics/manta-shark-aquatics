// Fixed classes (固定班): what a class's lessons are, the renewal hold, and
// the slot arithmetic shared by booking, renewing and changing slot.
// docs/fixed-class-spec.md sections 1, 4 and 5.
//
// The hold (section 5). For a class whose last lesson is L, the same slot in
// the ten weeks after L is kept for that family until 14 days before L; other
// families see it as full. A private or sibling 1-on-2 class holds the whole
// slot; a 1-on-4 class holds its own seat(s) and the others stay open. Nothing
// is written for it: it is worked out from the classes each time, so renewing
// (which moves L) or ending a class moves or drops the hold by itself.
//
// Because singles are bookable only 14 days ahead and a held week is at least
// 21 days out (L+7, while today <= L-14), a hold can only ever meet a fixed
// class, a renewal, a change of slot or a make-up -- never a single lesson.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isBlocked, type CoachBlock } from '@/lib/availability'
import { zoneTypeForSlug } from '@/lib/zones'
import { getTodayLA, getNowMinutesLA, minutesUntil } from '@/lib/date'
import { LEAD_TIME_MINUTES } from '@/lib/booking-time'
import { addDaysStr } from '@/lib/vouchers'

type Svc = SupabaseClient

// Paging helpers live in lib/db-paging.ts; re-exported for existing callers.
import { allRows, allRowsIn, PAGE_ROWS, IN_CHUNK } from './db-paging'
export { allRows, allRowsIn, PAGE_ROWS, IN_CHUNK }

/** The renewal email goes this many days before the last lesson. */
export const RENEW_NOTICE_DAYS = 21
/** The hold lasts until this many days before the last lesson. */
export const HOLD_RELEASE_DAYS = 14
/** How many weeks after the last lesson are held. */
export const HOLD_WEEKS = 10
/** A change of slot looks this many weeks past the lessons it is moving for room to append. */
export const MOVE_EXTRA_WEEKS = 8

export const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
export const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
/** 0 = Sunday, on the calendar date (no time zone involved). */
export const weekdayOf = (ds: string) => new Date(ds + 'T12:00:00Z').getUTCDay()

export const FC_COLUMNS = 'id, parent_id, student_id, student2_id, course_type_id, minutes, coach_id, weekday, start_time, status, created_at'

export type FixedClass = {
  id: string; parent_id: string; student_id: string; student2_id: string | null
  course_type_id: string; minutes: number; coach_id: string; weekday: number; start_time: string
  status: 'active' | 'ended'; created_at: string
}

export type LessonRow = {
  id: string; fixed_class_id: string; class_session_id: string; student_id: string; parent_id: string
  status: string; points_charged: number | null; points_refunded: number | null
  points_granted: number | null; points_granted_expires_at: string | null
  lesson_group_id: string | null; original_booking_id: string | null
  session: { session_date: string; start_time: string; end_time: string | null; coach_id: string; course_type_id: string }
}
/** One lesson of a fixed class: one date, its rows (a seat per swimmer, two halves for an hour). */
export type Lesson = { date: string; start: string; coachId: string; rows: LessonRow[] }

const ROW_COLS = 'id, fixed_class_id, class_session_id, student_id, parent_id, status, points_charged, points_refunded, points_granted, points_granted_expires_at, lesson_group_id, original_booking_id'

/** Every lesson still on the books (confirmed or taught) for these classes, by class, in date order. */
export async function lessonsOf(svc: Svc, fcIds: string[]): Promise<Map<string, Lesson[]>> {
  const out = new Map<string, Lesson[]>()
  if (fcIds.length === 0) return out
  let rows: LessonRow[] = []
  // bookings has two keys into class_sessions (class_session_id and
  // pending_new_session_id), so the embed has to name which one it means.
  // Paged and chunked (allRowsIn): renewalHolds passes every active class, and
  // their lessons run past 1,000 rows -- the rest were dropped silently, so a
  // class could look ended and its hold vanish (found 2026-10-05).
  const { data, error } = await allRowsIn(fcIds, chunk => svc.from('bookings')
    .select(`${ROW_COLS}, session:class_sessions!bookings_class_session_id_fkey(session_date, start_time, end_time, coach_id, course_type_id)`)
    .in('fixed_class_id', chunk).in('status', ['confirmed', 'completed']).order('id'))
  if (!error) {
    rows = (data || []).map((r: any) => ({ ...r, session: Array.isArray(r.session) ? r.session[0] : r.session }))
  } else {
    const { data: bs } = await allRowsIn(fcIds, chunk => svc.from('bookings').select(ROW_COLS)
      .in('fixed_class_id', chunk).in('status', ['confirmed', 'completed']).order('id'))
    const ids = [...new Set((bs || []).map((b: any) => b.class_session_id))]
    const sOf = new Map<string, any>()
    for (let i = 0; i < ids.length; i += 150) {
      const { data: ss } = await svc.from('class_sessions')
        .select('id, session_date, start_time, end_time, coach_id, course_type_id').in('id', ids.slice(i, i + 150))
      for (const s of ss || []) sOf.set(s.id, s)
    }
    rows = (bs || []).map((b: any) => ({ ...b, session: sOf.get(b.class_session_id) }))
  }
  const byKey = new Map<string, Lesson>()
  for (const r of rows) {
    if (!r.session) continue
    const k = `${r.fixed_class_id}|${r.session.session_date}`
    let l = byKey.get(k)
    if (!l) {
      l = { date: r.session.session_date, start: String(r.session.start_time).slice(0, 5), coachId: r.session.coach_id, rows: [] }
      byKey.set(k, l)
      out.set(r.fixed_class_id, [...(out.get(r.fixed_class_id) || []), l])
    }
    l.rows.push(r)
    const st = String(r.session.start_time).slice(0, 5)
    if (st < l.start) { l.start = st; l.coachId = r.session.coach_id }
  }
  for (const [, list] of out) {
    list.sort((a, b) => a.date.localeCompare(b.date))
    for (const l of list) l.rows.sort((a, b) => String(a.session.start_time).localeCompare(String(b.session.start_time)) || a.student_id.localeCompare(b.student_id))
  }
  return out
}

/** A lesson that has not started yet. */
export function isUpcoming(l: Lesson, today = getTodayLA(), nowMin = getNowMinutesLA()) {
  return l.date > today || (l.date === today && toMin(l.start) > nowMin)
}

export type ClassState = { last: string | null; next: string | null; left: number; total: number }
/**
 * `termLast` is the class's last date counting lessons the family took leave
 * from (termLastDates). Without it, leave on the final lesson made the term
 * look a week shorter: the renewal started on the very date the family said
 * they would be away, and the hold and the email came a week early (found
 * 2026-10-03).
 */
export function classState(lessons: Lesson[] | undefined, today = getTodayLA(), nowMin = getNowMinutesLA(), termLast?: string | null): ClassState {
  const list = lessons || []
  const up = list.filter(l => isUpcoming(l, today, nowMin) && l.rows.some(r => r.status === 'confirmed'))
  const lastBooked = list.length ? list[list.length - 1].date : null
  const last = termLast && (!lastBooked || termLast > lastBooked) ? termLast : lastBooked
  return { last, next: up[0]?.date ?? null, left: up.length, total: list.length }
}

/** Each class's last lesson date, including lessons a parent cancelled (leave
 *  or grace) -- not ones moved by a change of slot or cancelled by the school. */
export async function termLastDates(svc: Svc, fcIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (fcIds.length === 0) return out
  // Paged and chunked like lessonsOf (found 2026-10-05).
  const { data: rows } = await allRowsIn(fcIds, chunk => svc.from('bookings')
    .select('id, fixed_class_id, class_session_id, status, cancellation_reason')
    .in('fixed_class_id', chunk)
    .or('status.in.(confirmed,completed),and(status.eq.cancelled,cancellation_reason.eq.cancelled_by_parent)')
    .order('id'))
  const sids = [...new Set((rows || []).map((r: any) => r.class_session_id))]
  const dateOf = new Map<string, string>()
  for (let i = 0; i < sids.length; i += 150) {
    const { data: ss } = await svc.from('class_sessions').select('id, session_date').in('id', sids.slice(i, i + 150))
    for (const x of ss || []) dateOf.set(x.id, x.session_date)
  }
  for (const r of rows || []) {
    const d = dateOf.get(r.class_session_id)
    if (d && (!out.has(r.fixed_class_id) || d > out.get(r.fixed_class_id)!)) out.set(r.fixed_class_id, d)
  }
  return out
}

/** The hold is on until 14 days before the last lesson. */
export function holdLive(last: string | null, today = getTodayLA()) {
  return !!last && today <= addDaysStr(last, -HOLD_RELEASE_DAYS)
}
/** The renewal window: from three weeks before the last lesson until it. */
export function renewOpen(last: string | null, today = getTodayLA()) {
  return !!last && today >= addDaysStr(last, -RENEW_NOTICE_DAYS) && today <= last
}

export type Hold = {
  fixedClassId: string; parentId: string; coachId: string; courseTypeId: string
  date: string; startMin: number; endMin: number
  /** Seats kept in a 1-on-4; a private or sibling 1-on-2 hold is the whole slot. */
  seats: number; whole: boolean
}

/**
 * Every renewal hold falling between from and to, except the ones belonging to
 * exceptParentId (a family is never kept out of its own slot).
 */
export async function renewalHolds(svc: Svc, from: string, to: string, exceptParentId?: string | null, today = getTodayLA()): Promise<Hold[]> {
  // The earliest a held week can be: L+7 with L at least today+14.
  if (to < addDaysStr(today, HOLD_RELEASE_DAYS + 7)) return []
  // Paged: past 1,000 active classes the rest would have held nothing (found 2026-10-05).
  const { data: fcs, error } = await allRows(() => svc.from('fixed_classes').select(FC_COLUMNS).eq('status', 'active').order('id'))
  if (error) { console.error('renewalHolds: fixed classes not read:', error.message); return [] }
  const list = ((fcs || []) as FixedClass[]).filter(f => f.parent_id !== exceptParentId)
  if (list.length === 0) return []
  const [{ data: cts }, lessons, ends] = await Promise.all([
    svc.from('course_types').select('id, slug'),
    lessonsOf(svc, list.map(f => f.id)),
    termLastDates(svc, list.map(f => f.id)),
  ])
  const slugOf = new Map<string, string>((cts || []).map((c: any) => [c.id, c.slug]))
  const out: Hold[] = []
  for (const f of list) {
    const { last } = classState(lessons.get(f.id), today, undefined, ends.get(f.id))
    if (!holdLive(last, today)) continue
    const startMin = toMin(f.start_time)
    const whole = slugOf.get(f.course_type_id) !== '1on4'
    for (let k = 1; k <= HOLD_WEEKS; k++) {
      const date = addDaysStr(last!, 7 * k)
      if (date < from || date > to) continue
      out.push({
        fixedClassId: f.id, parentId: f.parent_id, coachId: f.coach_id, courseTypeId: f.course_type_id,
        date, startMin, endMin: startMin + (f.minutes || 30),
        seats: f.student2_id ? 2 : 1, whole,
      })
    }
  }
  return out
}

/** Seats the holds take out of a slot; Infinity when the slot is held outright. */
export function heldSeats(holds: Hold[] | undefined, coachId: string, date: string, startMin: number, endMin: number, courseTypeId: string): number {
  let n = 0
  for (const h of holds || []) {
    if (h.coachId !== coachId || h.date !== date || !(startMin < h.endMin && endMin > h.startMin)) continue
    if (h.whole || h.courseTypeId !== courseTypeId || h.startMin !== startMin) return Infinity
    n += h.seats
  }
  return n
}

export type Busy = { s: number; e: number; sessionId: string }

/** The swimmers' own lessons (any course, any coach) between from and to, by date. */
export async function studentBusy(svc: Svc, studentIds: string[], from: string, to: string, ignoreBookingIds?: Set<string>): Promise<Map<string, Busy[]>> {
  const out = new Map<string, Busy[]>()
  if (studentIds.length === 0) return out
  // Every lesson the swimmers ever booked, so paged: a long-time pair of
  // siblings can pass 1,000 rows, and the missing ones read as free (found 2026-10-05).
  const { data, error } = await allRows(() => svc.from('bookings')
    .select('id, class_session_id, session:class_sessions!bookings_class_session_id_fkey(session_date, start_time, end_time)')
    .in('student_id', studentIds).not('status', 'in', '("cancelled","pending_partner")').order('id'))
  if (error) { console.error('studentBusy:', error.message); return out }
  for (const r of (data || []) as any[]) {
    if (ignoreBookingIds?.has(r.id)) continue
    const s = Array.isArray(r.session) ? r.session[0] : r.session
    if (!s || s.session_date < from || s.session_date > to) continue
    const st = toMin(s.start_time)
    const en = s.end_time ? toMin(s.end_time) : st + 30
    out.set(s.session_date, [...(out.get(s.session_date) || []), { s: st, e: en, sessionId: r.class_session_id }])
  }
  return out
}

/** Everything about the coaches' calendars a range of weeks needs, read once. */
export type CalWindow = {
  zoned: Set<string>
  zones: Map<string, any[]>
  off: Map<string, CoachBlock[]>
  sess: Map<string, any[]>
}
export async function loadWindow(svc: Svc, coachIds: string[], from: string, to: string): Promise<CalWindow> {
  const w: CalWindow = { zoned: new Set(), zones: new Map(), off: new Map(), sess: new Map() }
  if (coachIds.length === 0) return w
  const [{ data: zrows }, { data: zany }, { data: offRows }, { data: sessRows }] = await Promise.all([
    svc.from('coach_availability_zones')
      .select('coach_id, zone_type, kind, weekday, override_date, start_time, end_time, group_level_min, group_level_max')
      .in('coach_id', coachIds)
      .or(`kind.eq.weekly,and(kind.eq.date,override_date.gte.${from},override_date.lte.${to})`),
    svc.from('coach_availability_zones').select('coach_id').in('coach_id', coachIds),
    // Paged: months of every coach's sessions (and time off) pass 1,000 rows,
    // and a session past the cut read as an empty lane (found 2026-10-05).
    allRows(() => svc.from('coach_time_off').select('id, coach_id, date, start_time, end_time, block_type')
      .in('coach_id', coachIds).gte('date', from).lte('date', to).order('id')),
    allRows(() => svc.from('class_sessions')
      .select('id, coach_id, session_date, start_time, end_time, course_type_id, enrolled_count, max_students, status')
      .in('coach_id', coachIds).gte('session_date', from).lte('session_date', to).in('status', ['open', 'full']).order('id')),
  ])
  for (const r of zany || []) w.zoned.add(r.coach_id)
  for (const r of zrows || []) w.zones.set(r.coach_id, [...(w.zones.get(r.coach_id) || []), r])
  for (const b of (offRows || []) as CoachBlock[]) { const k = `${b.coach_id}|${b.date}`; w.off.set(k, [...(w.off.get(k) || []), b]) }
  for (const s of sessRows || []) { const k = `${s.coach_id}|${s.session_date}`; w.sess.set(k, [...(w.sess.get(k) || []), s]) }
  return w
}

/** The zone rows that apply to a coach on a date: that day's own rows, else the weekly template. */
export function zonesOn(w: CalWindow, coachId: string, date: string): any[] {
  const all = w.zones.get(coachId) || []
  const dateRows = all.filter(r => r.kind === 'date' && r.override_date === date)
  return dateRows.length > 0 ? dateRows : all.filter(r => r.kind === 'weekly' && r.weekday === weekdayOf(date))
}

export type CandStatus = 'ok' | 'full' | 'booked' | 'time_off' | 'no_class' | 'conflict' | 'too_soon'
export type SlotQuery = {
  coachId: string; date: string; startMin: number; minutes: number
  ct: { id: string; slug: string; max_students: number }
  level: number; seats: number
  holds?: Hold[]
  /** Seats this family has in sessions it is moving out of: not counted against it. */
  ignoreSeats?: Map<string, number>
  busy?: Map<string, Busy[]>
  today?: string; nowMin?: number
}

/** Can these swimmers have this lesson with this coach on this date? */
export function evalSlot(w: CalWindow, q: SlotQuery): { status: CandStatus; spots: number } {
  const today = q.today ?? getTodayLA()
  const nowMin = q.nowMin ?? getNowMinutesLA()
  const startTime = minToTime(q.startMin)
  const endMin = q.startMin + q.minutes
  if (q.date < today || (q.date === today && minutesUntil(q.date, startTime, today, nowMin) < LEAD_TIME_MINUTES))
    return { status: 'too_soon', spots: 0 }
  const zoneType = zoneTypeForSlug(q.ct.slug)
  // A coach with no zone rows at all is on the old availability model, and the
  // booking routes let those through without a zone check.
  if (w.zoned.has(q.coachId)) {
    const picked = zonesOn(w, q.coachId, q.date)
    if (picked.some(r => r.zone_type === 'closed')) return { status: 'no_class', spots: 0 }
    const z = picked.find(r => r.zone_type === zoneType && toMin(r.start_time) <= q.startMin && endMin <= toMin(r.end_time))
    if (!z) return { status: 'no_class', spots: 0 }
    // The level band belongs to group zones; a private zone has none.
    if (zoneType === 'group' && z.group_level_min != null && z.group_level_max != null
        && (q.level < z.group_level_min || q.level > z.group_level_max)) return { status: 'no_class', spots: 0 }
  }
  if (isBlocked(w.off.get(`${q.coachId}|${q.date}`) || [], q.coachId, startTime, minToTime(endMin))) return { status: 'time_off', spots: 0 }
  const eff = (s: any) => (s.enrolled_count || 0) - (q.ignoreSeats?.get(s.id) || 0)
  const daySess = (w.sess.get(`${q.coachId}|${q.date}`) || []) as any[]
  const own = daySess.find(s => s.course_type_id === q.ct.id && toMin(s.start_time) === q.startMin && eff(s) > 0)
    || daySess.find(s => s.course_type_id === q.ct.id && toMin(s.start_time) === q.startMin)
  const mine = (q.busy?.get(q.date) || [])
  if (own && mine.some(b => b.sessionId === own.id)) return { status: 'booked', spots: Math.max(0, own.max_students - own.enrolled_count) }
  if (mine.some(b => q.startMin < b.e && endMin > b.s)) return { status: 'conflict', spots: 0 }
  // Anything else running in the coach's lane: another course, or this course
  // at another start (which an hour's second half can run into).
  const foreign = daySess.find(s => {
    if (s === own || eff(s) <= 0) return false
    const os = toMin(s.start_time)
    const oe = s.end_time ? toMin(s.end_time) : os + 30
    return q.startMin < oe && endMin > os
  })
  if (foreign) return { status: 'conflict', spots: 0 }
  const held = heldSeats(q.holds, q.coachId, q.date, q.startMin, endMin, q.ct.id)
  const enrolled = (own ? Math.max(0, eff(own)) : 0) + held
  // Two siblings need both seats on the same date.
  if (enrolled + q.seats > q.ct.max_students) return { status: 'full', spots: Math.max(0, q.ct.max_students - enrolled) }
  return { status: 'ok', spots: q.ct.max_students - enrolled }
}

export type Cand = { date: string; status: CandStatus; spots: number }

/** One weekday, time and coach, week by week from startDate: the fixed-class grid. */
export async function weeklyCandidates(svc: Svc, o: {
  coachId: string; ct: { id: string; slug: string; max_students: number }
  studentIds: string[]; level: number; startTime: string; startDate: string
  minutes: number; seats: number; weeks: number
  holds?: Hold[]; ignoreSeats?: Map<string, number>; ignoreBookingIds?: Set<string>
}): Promise<Cand[]> {
  const dates: string[] = []
  for (let i = 0, ds = o.startDate; i < o.weeks; i++, ds = addDaysStr(ds, 7)) dates.push(ds)
  if (dates.length === 0) return []
  const last = dates[dates.length - 1]
  const [w, busy] = await Promise.all([
    loadWindow(svc, [o.coachId], o.startDate, last),
    studentBusy(svc, o.studentIds, o.startDate, last, o.ignoreBookingIds),
  ])
  const today = getTodayLA(), nowMin = getNowMinutesLA()
  const startMin = toMin(o.startTime)
  return dates.map(date => ({
    date,
    ...evalSlot(w, {
      coachId: o.coachId, date, startMin, minutes: o.minutes, ct: o.ct, level: o.level, seats: o.seats,
      holds: o.holds, ignoreSeats: o.ignoreSeats, busy, today, nowMin,
    }),
  }))
}

/** The class's own lesson times as halves: an hour is two 30-minute sessions. */
export function halvesOf(startMin: number, minutes: number, slug: string): { start: string; end: string }[] {
  if (minutes === 60 && slug !== '1on4')
    return [
      { start: minToTime(startMin), end: minToTime(startMin + 30) },
      { start: minToTime(startMin + 30), end: minToTime(startMin + 60) },
    ]
  return [{ start: minToTime(startMin), end: minToTime(startMin + minutes) }]
}

/**
 * Daily: a family whose class is three weeks from its last lesson gets one
 * email asking whether to renew. Claimed before sending, so two overlapping
 * runs cannot both email; a renewal clears the flag for the next round.
 */
export async function sendRenewalNotices(svc: Svc, send: (fc: FixedClass, last: string) => Promise<boolean>, today = getTodayLA()) {
  const { data, error } = await svc.from('fixed_classes').select(FC_COLUMNS)
    .eq('status', 'active').is('renewal_notified_at', null)
  if (error) { console.error('renewal notices: fixed classes not read:', error.message); return { sent: 0, failed: -1 } }
  const list = (data || []) as FixedClass[]
  if (list.length === 0) return { sent: 0, failed: 0 }
  const [lessons, ends] = await Promise.all([lessonsOf(svc, list.map(f => f.id)), termLastDates(svc, list.map(f => f.id))])
  let sent = 0, failed = 0
  for (const f of list) {
    const st = classState(lessons.get(f.id), today, undefined, ends.get(f.id))
    if (!st.last || st.left === 0 || !renewOpen(st.last, today)) continue
    const stamp = new Date().toISOString()
    const { data: claimed } = await svc.from('fixed_classes')
      .update({ renewal_notified_at: stamp }).eq('id', f.id).is('renewal_notified_at', null).select('id')
    if (!claimed || claimed.length === 0) continue
    let ok = false
    try { ok = await send(f, st.last) } catch (e) { console.error('renewal notice failed', f.id, e) }
    if (ok) { sent++; continue }
    failed++
    // Not sent: give the claim back so tomorrow's run tries again. It used to
    // stay set, and a family whose email failed once never got a notice
    // (found 2026-10-05). Conditional on our own stamp, so a renewal that
    // cleared it, or another run that re-claimed it, is left alone.
    await svc.from('fixed_classes').update({ renewal_notified_at: null }).eq('id', f.id).eq('renewal_notified_at', stamp)
  }
  return { sent, failed }
}
