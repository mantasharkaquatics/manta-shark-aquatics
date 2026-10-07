// Does a swimmer already have a lesson at these times? (found 2026-10-07)
//
// The 1-on-2 invitation flow never asked. The inviter's own child is screened
// by the booking pages, but the invited family's child was not looked at when
// the invitation was made, nor when it was accepted -- so an invitation could
// be sent and accepted for a time that child was already booked, and the
// accept then either hit the database's STUDENT_DOUBLE_BOOKED guard (both
// families charged and refunded, "already processed" on every retry) or
// double-booked the child.
//
// Same rule as studentBusy in lib/fixed-classes: any course, any coach, every
// booking that holds a seat (cancelled rows and unaccepted invitations do not).
// Unlike studentBusy it reads one day only, through that day's sessions, rather
// than every lesson the swimmer ever booked.

import type { SupabaseClient } from '@supabase/supabase-js'

const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }

/**
 * The ids of the swimmers (of `studentIds`) who already have a lesson on
 * `date` overlapping any of `ranges` (minutes from midnight, end exclusive).
 * Sessions in `ignoreSessionIds` -- the lesson being confirmed -- never count.
 * A read error is logged and treated as "no clash": the database's own guard
 * still stands behind this check.
 */
export async function studentsBusyAt(
  svc: SupabaseClient,
  studentIds: string[],
  date: string,
  ranges: { s: number; e: number }[],
  ignoreSessionIds: string[] = [],
): Promise<string[]> {
  const ids = [...new Set(studentIds.filter(Boolean))]
  if (ids.length === 0 || ranges.length === 0) return []
  const { data: daySessions, error: sErr } = await svc
    .from('class_sessions')
    .select('id, start_time, end_time')
    .eq('session_date', date)
    .neq('status', 'cancelled')
  if (sErr) { console.error('studentsBusyAt (sessions):', sErr.message); return [] }
  const ignore = new Set(ignoreSessionIds)
  const overlapping = (daySessions || []).filter((x: any) => {
    if (ignore.has(x.id)) return false
    const s0 = toMin(x.start_time)
    const e0 = x.end_time ? toMin(x.end_time) : s0 + 30
    return ranges.some(r => r.s < e0 && r.e > s0)
  }).map((x: any) => x.id as string)
  if (overlapping.length === 0) return []
  const { data: rows, error: bErr } = await svc
    .from('bookings')
    .select('student_id')
    .in('student_id', ids)
    .in('class_session_id', overlapping)
    .not('status', 'in', '("cancelled","pending_partner")')
  if (bErr) { console.error('studentsBusyAt (bookings):', bErr.message); return [] }
  return [...new Set((rows || []).map((r: any) => r.student_id as string))]
}
