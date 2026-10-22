// Calendar files (.ics) attached to lesson emails (owner, 2026-10-22).
//
// Sent as an iTIP invitation (METHOD:REQUEST) from the school to the family,
// so a later email for the same lesson -- moved, or cancelled (METHOD:CANCEL)
// -- updates or removes the event the family already added. That only works
// because every email about one lesson uses the same UID (lib/lesson-calendar
// picks it) with a higher SEQUENCE each time.
//
// Times are written in America/Los_Angeles with the zone spelled out, so a
// family whose phone is set to another zone still sees the right hour.
// Pure: no imports, safe anywhere.

export type IcsEvent = {
  uid: string
  /** 'YYYY-MM-DD' and 'HH:MM' (24h), Los Angeles time. */
  date: string
  start: string
  minutes: number
  title: string
  location?: string
  description?: string
}

const TZ = 'America/Los_Angeles'
const VTIMEZONE = [
  'BEGIN:VTIMEZONE', `TZID:${TZ}`,
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0800', 'TZOFFSETTO:-0700', 'TZNAME:PDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'TZNAME:PST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
  'END:VTIMEZONE',
]

/** RFC 5545 TEXT escaping. */
const text = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines longer than 75 octets continue on the next line after a space. */
function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8')
  if (bytes.length <= 75) return line
  const out: string[] = []
  let cur = ''
  let curLen = 0
  for (const ch of line) {
    const n = Buffer.byteLength(ch, 'utf8')
    if (curLen + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; curLen = 0 }
    cur += ch; curLen += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

const local = (date: string, hhmm: string) => `${date.replace(/-/g, '')}T${hhmm.replace(':', '').padEnd(4, '0')}00`

/** The end of a lesson: start + minutes, same day (lessons never cross midnight). */
function plus(date: string, hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59)
  return local(date, `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`)
}

const utcStamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function icsFile(opts: {
  method: 'REQUEST' | 'CANCEL' | 'PUBLISH'
  events: IcsEvent[]
  organizer: { name: string; email: string }
  /** The family's address; left out of a file they download themselves (PUBLISH). */
  attendee?: string
}): string {
  // Higher on every send, so a calendar always takes the newest version.
  const seq = Math.max(0, Math.floor(Date.now() / 1000) - 1_790_000_000)
  const stamp = utcStamp()
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Manta Shark Aquatics//Lessons//EN', 'CALSCALE:GREGORIAN', `METHOD:${opts.method}`, ...VTIMEZONE]
  for (const e of opts.events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `SEQUENCE:${seq}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZ}:${local(e.date, e.start)}`,
      `DTEND;TZID=${TZ}:${plus(e.date, e.start, e.minutes)}`,
      `SUMMARY:${text(e.title)}`,
      ...(e.location ? [`LOCATION:${text(e.location)}`] : []),
      ...(e.description ? [`DESCRIPTION:${text(e.description)}`] : []),
      `ORGANIZER;CN=${text(opts.organizer.name)}:mailto:${opts.organizer.email}`,
      ...(opts.attendee && opts.method !== 'PUBLISH' ? [`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${opts.attendee}`] : []),
      `STATUS:${opts.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
      'TRANSP:OPAQUE',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
