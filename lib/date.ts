// Shared date utilities. All "today" and date-string calculations
// use America/Los_Angeles timezone since all customers are in Southern California.
// Using toISOString() for date-only strings is a bug: it converts to UTC,
// which can shift the calendar day near the UTC day boundary
// (e.g. 5-8pm Pacific Time is already the next day in UTC).

export function formatDateLA(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find(p => p.type === 'year')?.value
  const m = parts.find(p => p.type === 'month')?.value
  const d = parts.find(p => p.type === 'day')?.value
  return y + '-' + m + '-' + d
}

export function getTodayLA(): string {
  return formatDateLA(new Date())
}

// Minutes since midnight, in America/Los_Angeles time.
// Used to compare against a booking's HH:MM end_time to determine
// whether a lesson happening "today" has already finished.
export function getNowMinutesLA(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const h = Number(parts.find(p => p.type === 'hour')?.value || '0')
  const m = Number(parts.find(p => p.type === 'minute')?.value || '0')
  return h * 60 + m
}

// Format a 24-hour "HH:MM" or "HH:MM:SS" time string to 12-hour with AM/PM (e.g. "9:00 PM").
// Standing rule: all displayed times on the site use this format, never raw 24-hour.
export function formatTime12h(t: string | null | undefined): string {
  if (!t) return ''
  const parts = t.split(':')
  const h = parseInt(parts[0], 10)
  const m = parts[1] || '00'
  if (isNaN(h)) return t
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return h12 + ':' + m + ' ' + ampm
}

// Minutes from (todayStr @ nowMin) until (dateStr @ timeStr). Negative if already passed.
// Moved from bookings create/cart routes (was duplicated); LA-time inputs from getTodayLA/getNowMinutesLA.
export function minutesUntil(dateStr: string, timeStr: string, todayStr: string, nowMin: number) {
  const d = (s: string) => Date.parse(s + 'T00:00:00Z')
  const days = Math.round((d(dateStr) - d(todayStr)) / 86400000)
  const [h, m] = timeStr.split(':').map(Number)
  return days * 1440 + h * 60 + m - nowMin
}

// Venue slot cadence: 30-min lesson + 5-min turnover.
// Slots are generated from each zone's start_time, so cutting zones at the
// long-break boundaries is what produces the published 20-slot day.
export const SLOT_STEP_MINUTES = 35

// The teaching day: 30-min lessons on a 35-min cadence. Segment boundaries are
// where the cadence breaks — here only once, the 10-min break after slot 12.
export const DAY_SEGMENTS: [string, string][] = [
  ['09:10', '16:05'],
  ['16:15', '20:50'],
]
export const LESSON_MINUTES = 30
export function daySlots(): { start: string; end: string }[] {
  const toM = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const toT = (m: number) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0')
  const out: { start: string; end: string }[] = []
  for (const [a, b] of DAY_SEGMENTS) {
    for (let m = toM(a); m + LESSON_MINUTES <= toM(b); m += SLOT_STEP_MINUTES) out.push({ start: toT(m), end: toT(m + LESSON_MINUTES) })
  }
  return out
}
