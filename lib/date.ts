// Shared date utilities. All "today" and date-string calculations
// use America/Los_Angeles timezone since all customers are in Southern California.
// Using toISOString() for date-only strings is a bug: it converts to UTC,
// which can shift the calendar day near the UTC day boundary
// (e.g. 5-8pm Pacific Time is already the next day in UTC).

// Built once per module, not per call (found 2026-10-05): constructing an
// Intl.DateTimeFormat is far slower than formatting with one, and these
// helpers run inside per-slot loops on the booking calendar. Output is
// identical to the old per-call formatters.
const LA_DATE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const LA_HM_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
// Full wall-clock reading, used only to work out LA's UTC offset at an instant.
const LA_FULL_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export function formatDateLA(date: Date): string {
  const parts = LA_DATE_FMT.formatToParts(date)
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
  const parts = LA_HM_FMT.formatToParts(new Date())
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

// LA's offset from UTC, in minutes (-480 for PST, -420 for PDT), at instant `ms`.
function laOffsetMinutes(ms: number): number {
  const p: Record<string, number> = {}
  for (const x of LA_FULL_FMT.formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000)
}

/**
 * The UTC instant (epoch ms) of an America/Los_Angeles wall time. `timeStr` is
 * "HH:MM" or "HH:MM:SS"; seconds are ignored.
 *
 * Tries the offset in force a day before and a day after, and keeps whichever
 * reproduces the wall time. On the fall-back night the 1 AM hour happens twice:
 * both fit and the EARLIER (PDT) one is taken. On the spring-forward night
 * 2:00-2:59 never happens: neither fits, and the pre-change offset is used,
 * which lands an hour later on the clock (2:30 reads as 3:30 PDT) -- the same
 * rule as Temporal's 'compatible' disambiguation.
 */
export function laWallTimeToUtcMs(dateStr: string, timeStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const [h, mi] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h || 0, mi || 0)
  const before = laOffsetMinutes(guess - 86400000)
  const after = laOffsetMinutes(guess + 86400000)
  const fits = [...new Set([before, after])]
    .map(off => guess - off * 60000)
    .filter(ms => laOffsetMinutes(ms) * 60000 === guess - ms)
  if (fits.length) return Math.min(...fits)
  return guess - before * 60000
}

// Minutes from (todayStr @ nowMin) until (dateStr @ timeStr). Negative if already passed.
// Moved from bookings create/cart routes (was duplicated); LA-time inputs from getTodayLA/getNowMinutesLA.
//
// REAL elapsed minutes, not wall-clock minutes (found 2026-10-05). It used to
// count every day as 1440 minutes, so across a DST change the 24-hour
// cancellation line and the 30-minute lead time were off by an hour (the
// fall-back day is 1500 minutes long, the spring-forward day 1380). Both ends
// are now turned into UTC instants and subtracted. Same signature and inputs,
// so no caller changes. Self-checks (verified with TZ=UTC and TZ=Asia/Taipei):
//   ('2026-11-01','09:10','2026-10-31',570)  => 1480  (24h40m; was 1420 -> "within 24h")
//   ('2027-03-14','09:10','2027-03-13',570)  => 1360  (22h40m; was 1420)
//   ('2027-03-14','09:10','2027-03-13',510)  => 1420  (23h40m; was 1480 -> "not within 24h")
//   laWallTimeToUtcMs('2026-11-01','01:30') => 08:30Z (ambiguous hour: earlier, PDT)
//   laWallTimeToUtcMs('2027-03-14','02:30') => 10:30Z (nonexistent: reads as 3:30 PDT)
//   ('2026-10-06','09:10','2026-10-05',570)  => 1420  (no DST change: unchanged)
//   ('2026-10-05','09:00','2026-10-05',600)  => -60   (already started)
export function minutesUntil(dateStr: string, timeStr: string, todayStr: string, nowMin: number) {
  const nowHHMM = String(Math.floor(nowMin / 60)).padStart(2, '0') + ':' + String(nowMin % 60).padStart(2, '0')
  return Math.round((laWallTimeToUtcMs(dateStr, timeStr) - laWallTimeToUtcMs(todayStr, nowHHMM)) / 60000)
}

/** YYYY-MM-DD plus n calendar days. Pure date arithmetic; no time zone involved. */
export function addDaysYMD(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
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
