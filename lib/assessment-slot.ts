import type { SupabaseClient } from '@supabase/supabase-js'
import { getCoachBlocks, isBlocked } from '@/lib/availability'
import { getTodayLA, getNowMinutesLA, minutesUntil } from '@/lib/date'
import { LEAD_TIME_MINUTES } from '@/lib/booking-time'
import { getEffectiveZones } from '@/lib/zones'
import { renewalHolds, heldSeats } from '@/lib/fixed-classes'

/** How far ahead a Swim Assessment can be booked online. */
export const ASSESSMENT_MAX_DAYS = 60

/**
 * The checks a parent's Swim Assessment booking has to pass, in one place for
 * the two routes that make one (paid at the desk: trial-credit-book; paid by
 * card: stripe/trial-checkout). Both used to check only that the exact start
 * minute was free -- no date or time format, no past date, no lead time, no
 * coach zone, no overlap with a lesson starting at another minute, and the
 * card route not even coach time off (found 2026-10-03).
 *
 * Returns the error to send (English; lib/i18n/errors.ts maps it), or null.
 */
export async function assessmentSlotError(svc: SupabaseClient, o: {
  coachId: string; date: string; time: string; studentId: string; minutes: number
}): Promise<string | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date) || !/^\d{2}:\d{2}$/.test(o.time)) return 'Invalid date or time format'
  const today = getTodayLA(), nowMin = getNowMinutesLA()
  if (o.date < today || minutesUntil(o.date, o.time, today, nowMin) < LEAD_TIME_MINUTES)
    return 'Bookings must be made at least 30 minutes before the lesson starts. Please pick a later time.'
  const max = new Date(today + 'T12:00:00Z'); max.setUTCDate(max.getUTCDate() + ASSESSMENT_MAX_DAYS)
  if (o.date > max.toISOString().slice(0, 10)) return 'Bookings can be made up to 60 days in advance.'

  const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  const s = toMin(o.time), e = s + o.minutes
  const endT = `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`

  const blocks = await getCoachBlocks(svc, [o.coachId], o.date)
  if (isBlocked(blocks, o.coachId, o.time, endT)) return 'The coach is not available at this time. Please pick another time.'

  const eff = await getEffectiveZones(svc, o.coachId, o.date)
  if (!eff.legacy && !eff.rows.some((z: any) => z.zone_type === 'private' && toMin(z.start_time) <= s && e <= toMin(z.end_time)))
    return 'This time is not available for this course type. Please pick another time.'

  const overlaps = (x: any) => { const a = toMin(x.start_time); const b = x.end_time ? toMin(x.end_time) : a + 30; return s < b && e > a }
  const { data: coachDay } = await svc.from('class_sessions')
    .select('id, start_time, end_time, enrolled_count').eq('coach_id', o.coachId).eq('session_date', o.date)
    .in('status', ['open', 'full']).gt('enrolled_count', 0)
  if ((coachDay || []).some(overlaps)) return 'The coach already has another class at this time. Please pick another time.'

  // Another family's renewal hold (lib/fixed-classes) takes the slot even
  // though nothing is booked in it yet; an assessment used to be able to land
  // in one (found 2026-10-05). An assessment is never a fixed-class course,
  // so any hold overlapping the time is the whole slot to it (heldSeats
  // returns Infinity for a hold of another course type). The swimmer's own
  // family is never kept out of its own slot.
  const { data: stu } = await svc.from('students').select('parent_id').eq('id', o.studentId).maybeSingle()
  const holds = await renewalHolds(svc, o.date, o.date, stu?.parent_id ?? null)
  if (heldSeats(holds, o.coachId, o.date, s, e, '') > 0)
    return 'This time slot is no longer available. Please pick another time.'

  const { data: mine } = await svc.from('bookings').select('class_session_id').eq('student_id', o.studentId)
    .in('status', ['confirmed', 'in_cart', 'pending_payment', 'pending_partner'])
  const ids = [...new Set((mine || []).map((b: any) => b.class_session_id))]
  if (ids.length) {
    const { data: ms } = await svc.from('class_sessions').select('id, start_time, end_time')
      .in('id', ids).eq('session_date', o.date).neq('status', 'cancelled')
    if ((ms || []).some(overlaps)) return 'This swimmer already has a lesson at this time. Please pick another time.'
  }
  return null
}
