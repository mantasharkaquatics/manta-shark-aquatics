// The two clock rules a booking has to satisfy. Neither has anything to do with
// how a lesson is paid for -- they lived in lib/tokens.ts only because that is
// where the booking rules happened to be written down first, and they outlived
// it.
//
// Both are judged in the school's local time, because a parent reads a booking
// page against the clock on their wall.

import { getTodayLA, getNowMinutesLA, minutesUntil } from '@/lib/date'

/** A lesson cannot be booked less than this long before it starts. */
export const LEAD_TIME_MINUTES = 30

export function meetsLeadTime(session_date: string, start_time: string): boolean {
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  if (session_date < today) return false
  return minutesUntil(session_date, start_time, today, nowMin) >= LEAD_TIME_MINUTES
}

/**
 * The 24-hour line. Inside it a lesson cannot be rescheduled online, and
 * cancelling costs the points unless the family spends a late-cancellation
 * allowance. A lesson in the past counts as inside it.
 */
export function isWithin24Hours(session_date: string, start_time: string): boolean {
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  if (session_date < today) return true
  return minutesUntil(session_date, start_time, today, nowMin) < 24 * 60
}
