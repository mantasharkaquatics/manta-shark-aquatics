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
