/* Time off that families have already been told about.

   The admin's one-step "cancel & notify" on the Time Off page cancels the
   lessons inside a coach's time off and emails the families. After that the
   time off row is the admin's only record of those cancellations, and the
   families have been told the coach is away. A coach removing it used to leave
   the families' lessons cancelled with nothing on the Time Off page to explain
   them -- or, under the old two-step flow, booked and charged after an email
   said they were cancelled (found 2026-10-07). So once any booking in the time
   off's window carries a notice or a time-off cancellation, the coach can no
   longer remove it (owner, 2026-10-07); the office can.

   One copy: the coach page (to hide the Remove button) and the coach delete
   route (to refuse it) both ask here. */

type Block = { id: string; coach_id: string; date: string; start_time: string | null; end_time: string | null }

const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

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
    .select('class_session_id')
    .in('class_session_id', sessions.map((s: any) => s.id))
    .or('block_notice_sent_at.not.is.null,and(status.eq.cancelled,cancellation_reason.eq.coach_time_off)')
  if (bErr) return null
  const touched = new Set((bookings || []).map((b: any) => b.class_session_id))
  for (const b of blocks) {
    const hit = (sessions as any[]).some(s => {
      if (!touched.has(s.id) || s.coach_id !== b.coach_id || s.session_date !== b.date) return false
      if (b.start_time == null || b.end_time == null) return true
      return toM(s.start_time) < toM(b.end_time) && toM(s.end_time) > toM(b.start_time)
    })
    if (hit) out.add(b.id)
  }
  return out
}
