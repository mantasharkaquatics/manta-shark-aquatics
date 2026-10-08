/* Time off that families have already been told about.

   The admin's one-step "cancel & notify" on the Time Off page cancels the
   lessons inside a coach's time off and emails the families. After that the
   time off row is the admin's only record of those cancellations, and the
   families have been told the coach is away. A coach removing it used to leave
   the families' lessons cancelled with nothing on the Time Off page to explain
   them -- or, under the old two-step flow, booked and charged after an email
   said they were cancelled (found 2026-10-07). So once a booking in the time
   off's window carries a notice or a time-off cancellation FOR THIS time off,
   the coach can no longer remove it (owner, 2026-10-07); the office can.

   For this time off: a booking does not say which time off it was cancelled
   for, so the times decide. A cancellation or notice from before this time
   off was entered belongs to an earlier one on the same slot -- say an admin
   block the office had already handled -- and used to lock (and, in Reviews,
   hide) this one as if its families had been told (found 2026-10-08).

   One copy: the coach page (to hide the Remove button) and the coach delete
   route (to refuse it) both ask here. */

import { isRealBooking } from '@/app/coach/real-booking'
import { allRows, allRowsIn } from '@/lib/db-paging'
import type { SupabaseClient } from '@supabase/supabase-js'

type Block = { id: string; coach_id: string; date: string; start_time: string | null; end_time: string | null; created_at?: string | null }

const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

/** Most days one request may cover (owner, 2026-10-08: consecutive days in
 *  one go). A long leave is a few weeks; a typo in the year is not. */
export const MAX_TIME_OFF_DAYS = 60

/** YYYY-MM-DD plus n calendar days. */
export function addDaysISO(d: string, n: number): string {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** Ids of the given time off rows whose families have been notified or whose
 *  lessons were cancelled for it. A failed read returns null: callers treat
 *  "cannot tell" as handled, so a coach is never let through on a guess. */
export async function handledTimeOffIds(svc: any, blocks: Block[]): Promise<Set<string> | null> {
  const out = new Set<string>()
  if (blocks.length === 0) return out
  const coachIds = [...new Set(blocks.map(b => b.coach_id))]
  const dates = [...new Set(blocks.map(b => b.date))]
  const { data: sessions, error } = await svc
    .from('class_sessions')
    .select('id, coach_id, session_date, start_time, end_time')
    .in('coach_id', coachIds)
    .in('session_date', dates)
  if (error) return null
  if (!sessions || sessions.length === 0) return out
  const { data: bookings, error: bErr } = await svc
    .from('bookings')
    .select('class_session_id, status, cancellation_reason, cancelled_at, block_notice_sent_at')
    .in('class_session_id', sessions.map((s: any) => s.id))
    .or('block_notice_sent_at.not.is.null,and(status.eq.cancelled,cancellation_reason.eq.coach_time_off)')
  if (bErr) return null
  // When each touched session was acted on: a time-off cancellation by when it
  // was cancelled (a retried email can stamp its notice later), anything else
  // by its notice. No time on record: counted, the safe way round.
  const actedAt = new Map<string, number[]>()
  for (const b of (bookings || []) as any[]) {
    const raw = b.status === 'cancelled' && b.cancellation_reason === 'coach_time_off'
      ? (b.cancelled_at || b.block_notice_sent_at)
      : b.block_notice_sent_at
    const ms = raw ? Date.parse(raw) : NaN
    actedAt.set(b.class_session_id, [...(actedAt.get(b.class_session_id) || []), Number.isFinite(ms) ? ms : -Infinity])
  }
  for (const b of blocks) {
    const since = b.created_at ? Date.parse(b.created_at) : NaN
    const forThis = (times: number[]) => !Number.isFinite(since) || times.some(t => t === -Infinity || t >= since)
    const hit = (sessions as any[]).some(s => {
      const times = actedAt.get(s.id)
      if (!times || s.coach_id !== b.coach_id || s.session_date !== b.date) return false
      if (!forThis(times)) return false
      if (b.start_time == null || b.end_time == null) return true
      return toM(s.start_time) < toM(b.end_time) && toM(s.end_time) > toM(b.start_time)
    })
    if (hit) out.add(b.id)
  }
  return out
}

/* Booked lessons inside a coach's time off.

   One reading for three places (owner, 2026-10-08): the coach's form lists
   them before sending (/api/coach/time-off-impact), the send itself alerts the
   desk with them (/api/coach/time-off POST), and the admin Reviews page keeps
   a red item for every time off that still has them until the office has
   handled it (timeOffNeedingAction below).

   Only real bookings (not cancelled / in a basket / unpaid / an unaccepted
   invite), dropped BEFORE merging so a dead row's lesson_group_id cannot pull
   an unrelated session into an hour. A 60-minute lesson is two sessions
   sharing a lesson_group_id: one lesson spanning the hour, and the whole
   lesson counts when time off covers any part of it (admin/time-off/impact
   does the same). */

export type BookedLesson = {
  date: string
  start: string
  end: string
  course_type_id: string | null
  is_trial: boolean
  students: { id: string; parent_id: string | null }[]
}

type SessionRow = { id: string; coach_id: string; session_date: string; start_time: string; end_time: string; course_type_id: string | null }
type BlockRow = { id: string; coach_id: string; date: string; start_time: string | null; end_time: string | null; reason: string | null; created_at: string | null }
type BookingRow = { class_session_id: string; student_id: string | null; parent_id: string | null; status: string; lesson_group_id: string | null; is_trial: boolean | null; block_notice_sent_at?: string | null }

/** One coach's day of sessions and bookings, merged into lessons. */
function lessonsOfDay(sessions: SessionRow[], bookings: BookingRow[]): BookedLesson[] {
  const real = bookings.filter(isRealBooking)
  const bySession = new Map<string, BookingRow[]>()
  for (const b of real) bySession.set(b.class_session_id, [...(bySession.get(b.class_session_id) || []), b])
  type Acc = BookedLesson & { ids: Set<string> }
  const byKey = new Map<string, Acc>()
  for (const s of sessions) {
    const bs = bySession.get(s.id) || []
    if (bs.length === 0) continue
    const groups = [...new Set(bs.map(b => b.lesson_group_id).filter(Boolean))]
    const key = groups.length === 1 ? 'g:' + groups[0] : 's:' + s.id
    const st = String(s.start_time).slice(0, 5)
    const en = String(s.end_time).slice(0, 5)
    let cur = byKey.get(key)
    if (!cur) {
      cur = { date: s.session_date, start: st, end: en, course_type_id: s.course_type_id || null, is_trial: true, students: [], ids: new Set() }
      byKey.set(key, cur)
    }
    if (st < cur.start) cur.start = st
    if (en > cur.end) cur.end = en
    cur.is_trial = cur.is_trial && bs.every(b => !!b.is_trial)
    for (const b of bs) {
      if (!b.student_id || cur.ids.has(b.student_id)) continue
      cur.ids.add(b.student_id)
      cur.students.push({ id: b.student_id, parent_id: b.parent_id || null })
    }
  }
  return [...byKey.values()]
    .map(({ ids: _ids, ...l }) => l)
    .sort((a, b) => a.start.localeCompare(b.start))
}

const overlaps = (l: { start: string; end: string }, start: string | null, end: string | null) =>
  start == null || end == null || (toM(l.start) < toM(end) && toM(l.end) > toM(start))

/** A lesson that has already ended is past acting on: the desk alert, its
 *  withdrawal note and the Reviews item all leave it out (found 2026-10-08:
 *  same-day time off listed the morning's finished lessons, with the
 *  families' phone numbers, in the alert but not in Reviews). `today` and
 *  `nowMin` from getTodayLA / getNowMinutesLA. */
export function lessonEnded(l: { date: string; end: string }, today: string, nowMin: number): boolean {
  return l.date < today || (l.date === today && toM(l.end) <= nowMin)
}

/** Booked lessons of one coach inside a window (no start/end = the whole
 *  day). null when the read failed. */
export async function bookedLessonsInWindow(
  svc: SupabaseClient, coachId: string, date: string, start: string | null, end: string | null,
): Promise<BookedLesson[] | null> {
  return bookedLessonsInRange(svc, coachId, date, date, start, end)
}

/** The same over a run of days, `from` to `to` inclusive, the same window on
 *  each (a coach may now ask for several days at once -- owner, 2026-10-08).
 *  Sorted by date, then time. null when the read failed. */
export async function bookedLessonsInRange(
  svc: SupabaseClient, coachId: string, from: string, to: string, start: string | null, end: string | null,
): Promise<BookedLesson[] | null> {
  const { data: sessions, error } = await allRows(() => svc
    .from('class_sessions')
    .select('id, coach_id, session_date, start_time, end_time, course_type_id')
    .eq('coach_id', coachId)
    .gte('session_date', from)
    .lte('session_date', to)
    .neq('status', 'cancelled')
    .order('id'))
  if (error) return null
  if (!sessions || sessions.length === 0) return []
  const { data: bookings, error: bErr } = await allRowsIn((sessions as SessionRow[]).map(s => s.id), chunk => svc
    .from('bookings')
    .select('id, class_session_id, student_id, parent_id, status, lesson_group_id, is_trial')
    .in('class_session_id', chunk)
    .order('id'))
  if (bErr) return null
  const days = [...new Set((sessions as SessionRow[]).map(s => s.session_date))].sort()
  return days.flatMap(d => {
    const ss = (sessions as SessionRow[]).filter(s => s.session_date === d)
    const ids = new Set(ss.map(s => s.id))
    return lessonsOfDay(ss, (bookings as BookingRow[]).filter(b => ids.has(b.class_session_id))).filter(l => overlaps(l, start, end))
  })
}

/** Which of these sessions sit inside one of the coach's blocks (time off or
 *  an office block) that day. The coach's Today and Schedule pages mark them
 *  "time off -- waiting for the office": until the office cancels them they
 *  looked like any other lesson (found 2026-10-08). */
export function sessionsInBlocks(
  sessions: { id: string; session_date: string; start_time: string; end_time: string }[],
  blocks: { date: string; start_time: string | null; end_time: string | null }[],
): string[] {
  return sessions.filter(s => blocks.some(b => b.date === s.session_date && overlaps(
    { start: String(s.start_time).slice(0, 5), end: String(s.end_time).slice(0, 5) }, b.start_time, b.end_time,
  ))).map(s => s.id)
}

export type TimeOffActionItem = {
  id: string
  coach_id: string
  coach_name: string
  date: string
  start_time: string | null
  end_time: string | null
  reason: string | null
  created_at: string | null
  lessons: { start: string; end: string; students: string[] }[]
}

/**
 * Coach time off with booked lessons the office has not dealt with yet
 * (owner, 2026-10-08): one red item each on /admin/reviews and in the
 * sidebar badge. Judged lesson by lesson, inside this time off's own window:
 * an item stays while a real booking there is not cancelled, not told (no
 * notice -- the Time Off page's "pending") and not over. The admin's
 * "cancel & notify" cancels and tells them all, so the item goes. It used to
 * ask handledTimeOffIds, which calls a whole time off handled once ANY
 * booking in its window was -- so lessons cancelled earlier for a different
 * time off on the same slot hid this one's live lessons (found 2026-10-08).
 * Time off the office entered itself (admin_block) is left out: the office
 * already knows.
 */
export async function timeOffNeedingAction(
  svc: SupabaseClient, today: string, nowMin: number, withDetails: boolean, coachId?: string,
): Promise<TimeOffActionItem[]> {
  // coachId: one coach's own (their Time Off page shows how many lessons in
  // each request still wait for the office -- found 2026-10-08).
  let q = svc
    .from('coach_time_off')
    .select('id, coach_id, date, start_time, end_time, reason, created_at')
    .eq('block_type', 'time_off')
    .gte('date', today)
  if (coachId) q = q.eq('coach_id', coachId)
  const { data: blocks, error } = await q
    .order('date')
    .order('id')
  if (error) { console.error('timeOffNeedingAction: time off not read:', error.message); return [] }
  if (!blocks || blocks.length === 0) return []

  const rows = blocks as BlockRow[]
  const coachIds = [...new Set(rows.map(b => b.coach_id))]
  const dates = [...new Set(rows.map(b => b.date))]
  const { data: sessions, error: sErr } = await allRows(() => svc
    .from('class_sessions')
    .select('id, coach_id, session_date, start_time, end_time, course_type_id')
    .in('coach_id', coachIds)
    .in('session_date', dates)
    .neq('status', 'cancelled')
    .order('id'))
  if (sErr) { console.error('timeOffNeedingAction: sessions not read:', sErr.message); return [] }
  if (!sessions || sessions.length === 0) return []
  const { data: bookings, error: bErr } = await allRowsIn((sessions as SessionRow[]).map(s => s.id), chunk => svc
    .from('bookings')
    .select('id, class_session_id, student_id, parent_id, status, lesson_group_id, is_trial, block_notice_sent_at')
    .in('class_session_id', chunk)
    .order('id'))
  if (bErr) { console.error('timeOffNeedingAction: bookings not read:', bErr.message); return [] }

  const dayLessons = new Map<string, BookedLesson[]>()
  const lessonsFor = (coachId: string, date: string) => {
    const k = coachId + '|' + date
    let got = dayLessons.get(k)
    if (!got) {
      const ss = (sessions as SessionRow[]).filter(s => s.coach_id === coachId && s.session_date === date)
      const ids = new Set(ss.map(s => s.id))
      // A booking the family has been told about is the office's already.
      got = lessonsOfDay(ss, (bookings as BookingRow[]).filter(b => ids.has(b.class_session_id) && !b.block_notice_sent_at))
      dayLessons.set(k, got)
    }
    return got
  }

  const waiting = rows
    .map(b => ({ b, lessons: lessonsFor(b.coach_id, b.date).filter(l => overlaps(l, b.start_time, b.end_time) && !lessonEnded(l, today, nowMin)) }))
    .filter(x => x.lessons.length > 0)
  if (waiting.length === 0) return []

  const coachNames = new Map<string, string>()
  const studentNames = new Map<string, string>()
  if (withDetails) {
    const sIds = [...new Set(waiting.flatMap(x => x.lessons.flatMap(l => l.students.map(s => s.id))))]
    const [{ data: cs }, { data: sts }] = await Promise.all([
      svc.from('coaches').select('id, first_name, last_name').in('id', [...new Set(waiting.map(x => x.b.coach_id))]),
      sIds.length ? svc.from('students').select('id, full_name').in('id', sIds) : Promise.resolve({ data: [] }),
    ])
    for (const c of cs || []) coachNames.set(c.id, `${c.first_name || ''} ${c.last_name || ''}`.trim())
    for (const s of sts || []) studentNames.set(s.id, s.full_name || '')
  }
  return waiting.map(({ b, lessons }): TimeOffActionItem => ({
    id: b.id,
    coach_id: b.coach_id,
    coach_name: coachNames.get(b.coach_id) || '',
    date: b.date,
    start_time: b.start_time ?? null,
    end_time: b.end_time ?? null,
    reason: b.reason ?? null,
    created_at: b.created_at ?? null,
    lessons: lessons.map(l => ({
      start: l.start, end: l.end,
      students: l.students.map(s => studentNames.get(s.id) || '').filter(Boolean),
    })),
  }))
}
