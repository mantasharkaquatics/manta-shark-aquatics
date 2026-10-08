import { isBlocked, type CoachBlock } from '@/lib/availability'
import { heldSeats, type Hold } from '@/lib/fixed-classes'

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** A session in one coach's lane that day. A session held by a live 1-on-2
 *  invitation comes in looking full (lib/bookings/invite-holds). */
export type LaneSession = {
  course_type_id: string
  start_time: string
  end_time?: string | null
  enrolled_count: number
  max_students: number
}

/**
 * Whether one coach can take a private lesson (1-on-1 or 1-on-2) of
 * `courseTypeId` from startMin to endMin on `date`. The rule bookings/openings
 * applies to the booking page and the public "next 7 days" preview applies to
 * the programme pages -- one function, so the two cannot drift apart again
 * (found 2026-10-07: the preview still had the rules from before 2026-10-05
 * and showed 1-on-2 times the booking page refused).
 *
 * The caller has already put the time inside the coach's private zone (or
 * legacy weekly hours) and applied the 30-minute lead time.
 *
 *  - time off and admin blocks;
 *  - `busy`: the swimmers' own lessons that day, with any coach;
 *  - other families' renewal holds (lib/fixed-classes);
 *  - a same-course lesson already at this start needs room for `seats`
 *    (a 1-on-2 is always two: two of yours, or yours and an invited family's);
 *  - anything ELSE running in the coach's lane blocks the time, whether or not
 *    a same-course session exists -- cancellations leave empty 'open' sessions
 *    behind, which used to make a time read as free over another lesson.
 */
export function privateSlotOpen(o: {
  coachId: string
  date: string
  startMin: number
  endMin: number
  courseTypeId: string
  seats: number
  blocks: CoachBlock[]
  sessions: LaneSession[]
  busy?: { s: number; e: number }[]
  holds?: Hold[]
}): boolean {
  const { coachId, date, startMin: m, endMin: end, courseTypeId, seats } = o
  if (isBlocked(o.blocks, coachId, toTime(m), toTime(end))) return false
  if ((o.busy || []).some(iv => m < iv.e && end > iv.s)) return false
  if (heldSeats(o.holds, coachId, date, m, end, courseTypeId) > 0) return false
  // Only a session with someone in it is "the lesson at this time"; an empty
  // one takes no seat and blocks nothing.
  const live = o.sessions.filter(s => s.enrolled_count > 0)
  const same = live.find(s => s.course_type_id === courseTypeId && toMin(s.start_time) === m)
  if (same && same.enrolled_count + seats > same.max_students) return false
  return !live.some(s => {
    if (s === same) return false
    const ss = toMin(s.start_time)
    const se = s.end_time ? toMin(s.end_time) : ss + 30
    return m < se && end > ss
  })
}
