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

/**
 * How far ahead a SINGLE lesson can be booked (owner, 2026-10-01). Only a
 * fixed class books further out: a family who wants the same slot every week
 * commits to a term for it, rather than holding it with single lessons they
 * can still cancel 24 hours ahead. The Swim Assessment is not a single lesson
 * in this sense and keeps its own window.
 */
export const SINGLE_BOOKING_DAYS = 14

/** A fixed class is at least this many lessons. */
export const FIXED_CLASS_MIN_LESSONS = 10

/** The last date a single lesson can be booked for, as YYYY-MM-DD (LA). */
export function singleMaxDate(today: string = getTodayLA()): string {
  const d = new Date(today + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + SINGLE_BOOKING_DAYS)
  return d.toISOString().slice(0, 10)
}

export const SINGLE_TOO_FAR_ERROR = `Single lessons can be booked up to ${SINGLE_BOOKING_DAYS} days in advance. For later dates, sign up for a fixed weekly class.`
