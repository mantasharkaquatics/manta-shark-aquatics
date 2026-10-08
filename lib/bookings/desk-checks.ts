/* What the desk's own booking and moving routes check before they write
   (found 2026-10-08):

   - the coach's time off and blocks, by the hours they cover. A block from
     2 to 3pm used to mark the whole day "coach time off" in the recurring
     preview, and the drag/move route did not read time off at all;
   - the swimmer's other lessons at that time, any coach, any course. Moving a
     session is an update of class_sessions, so the database's own
     double-booking guard on bookings never sees it.

   Both throw when the read fails. A failed read used to come back as "nothing
   there", so every date looked free; a desk action can be retried, a lesson
   booked on top of time off has to be undone with the family. */

import type { SupabaseClient } from '@supabase/supabase-js'
import { allRows } from '@/lib/db-paging'
import { renewalHolds, heldSeats, type Hold } from '@/lib/fixed-classes'

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

/** Minutes from midnight, end exclusive. */
export type Span = { s: number; e: number }
export type LessonSpan = Span & { studentId: string; sessionId: string }

export const overlapsAny = (spans: Span[] | undefined, s: number, e: number) =>
  (spans || []).some(x => x.s < e && x.e > s)

/** The coach's time off and blocks on these dates, by date. A row with no
 *  times is the whole day. */
export async function coachBlocksOn(svc: SupabaseClient, coachId: string, dates: string[]): Promise<Map<string, Span[]>> {
  const out = new Map<string, Span[]>()
  const uniq = [...new Set(dates)]
  // 100 dates per request keeps the URL short; a preview asks for up to ~160.
  for (let i = 0; i < uniq.length; i += 100) {
    const { data, error } = await allRows(() => svc.from('coach_time_off')
      .select('id, date, start_time, end_time')
      .eq('coach_id', coachId).in('date', uniq.slice(i, i + 100)).order('id'))
    if (error) throw new Error(`coach time off read failed: ${error.message || error}`)
    for (const r of data) {
      const span = r.start_time == null || r.end_time == null
        ? { s: 0, e: 24 * 60 }
        : { s: toMin(r.start_time), e: toMin(r.end_time) }
      out.set(r.date, [...(out.get(r.date) || []), span])
    }
  }
  return out
}

/** The swimmers' seat-holding lessons on these dates, by date. Same rule as
 *  studentsBusyAt / studentBusy: every booking except cancelled rows and
 *  unaccepted invitations. Lessons in `ignoreSessionIds` (the ones being
 *  moved) do not count. */
export async function studentLessonsOn(
  svc: SupabaseClient, studentIds: string[], dates: string[], ignoreSessionIds: string[] = [],
): Promise<Map<string, LessonSpan[]>> {
  const out = new Map<string, LessonSpan[]>()
  const ids = [...new Set(studentIds.filter(Boolean))]
  if (ids.length === 0 || dates.length === 0) return out
  const want = new Set(dates)
  const ignore = new Set(ignoreSessionIds)
  const { data, error } = await allRows(() => svc.from('bookings')
    .select('id, student_id, class_session_id, session:class_sessions!bookings_class_session_id_fkey(session_date, start_time, end_time, status)')
    .in('student_id', ids).not('status', 'in', '("cancelled","pending_partner")').order('id'))
  if (error) throw new Error(`student lessons read failed: ${error.message || error}`)
  for (const r of data) {
    if (ignore.has(r.class_session_id)) continue
    const s = Array.isArray(r.session) ? r.session[0] : r.session
    if (!s || s.status === 'cancelled' || !want.has(s.session_date)) continue
    const st = toMin(s.start_time)
    const en = s.end_time ? toMin(s.end_time) : st + 30
    out.set(s.session_date, [...(out.get(s.session_date) || []), { s: st, e: en, studentId: r.student_id, sessionId: r.class_session_id }])
  }
  return out
}

/** A fixed-class renewal hold a desk booking would land on. */
export type HoldHit = { date: string; family: string; until: string }

/**
 * Fixed-class renewal holds (lib/fixed-classes renewalHolds) in the way of a
 * desk booking, by date (found 2026-10-08). The renewal email promises the
 * family the same slot until `until`; every parent path counts the hold as
 * full, but the desk's routes did not read it, so another family could be put
 * in a held week and the renewing family then found it taken.
 *
 * Owner, 2026-10-08: the desk is warned and may book over the hold only by
 * confirming a second time (the route's `override_holds`); the renewing family
 * is not told. A hold of one of `exceptParentIds` (the families being booked)
 * never counts -- a family is never kept out of its own slot.
 *
 * `capacity(date)` is what the slot already holds and takes; null means no
 * class there yet, so `defaultMax` seats. A private or sibling 1-on-2 hold,
 * or one for another course or start time, is the whole slot.
 */
export async function renewalHoldsInWay(svc: SupabaseClient, o: {
  coachId: string; courseTypeId: string; dates: string[]; spanStart: number; spanEnd: number
  seatsNeeded: number; defaultMax: number
  capacity?: (date: string) => { enrolled: number; max: number } | null
  exceptParentIds: (string | null | undefined)[]
}): Promise<Map<string, HoldHit>> {
  const out = new Map<string, HoldHit>()
  const dates = [...new Set(o.dates)].sort()
  if (dates.length === 0) return out
  const except = new Set(o.exceptParentIds.filter(Boolean) as string[])
  const holds: Hold[] = (await renewalHolds(svc as any, dates[0], dates[dates.length - 1], null))
    .filter(h => !except.has(h.parentId) && h.coachId === o.coachId)
  if (holds.length === 0) return out
  const hits: { date: string; hold: Hold }[] = []
  for (const date of dates) {
    const held = heldSeats(holds, o.coachId, date, o.spanStart, o.spanEnd, o.courseTypeId)
    if (held <= 0) continue
    const cap = o.capacity?.(date) ?? { enrolled: 0, max: o.defaultMax }
    if (held !== Infinity && cap.enrolled + o.seatsNeeded + held <= cap.max) continue
    const hold = holds.find(h => h.date === date && o.spanStart < h.endMin && o.spanEnd > h.startMin)
    if (hold) hits.push({ date, hold })
  }
  if (hits.length === 0) return out
  const pids = [...new Set(hits.map(h => h.hold.parentId))]
  const { data: fams } = await svc.from('parents').select('id, first_name, last_name').in('id', pids)
  const name = new Map((fams || []).map((p: any) => [p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim()]))
  for (const h of hits) out.set(h.date, { date: h.date, family: name.get(h.hold.parentId) || '', until: h.hold.until })
  return out
}

/** The refusal a desk route sends for holds in the way; the page asks the
 *  desk and sends the request again with override_holds. */
export function renewalHoldRefusal(hits: Map<string, HoldHit>) {
  const list = [...hits.values()]
  return {
    error: `Held for a fixed-class renewal: ${list.map(h => `${h.date} (${h.family || 'a family'}, until ${h.until})`).join(', ')}. Confirm to book over the hold.`,
    code: 'renewal_hold',
    holds: list,
  }
}
