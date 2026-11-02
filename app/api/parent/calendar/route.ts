import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { lessonCalendar } from '@/lib/lesson-calendar'
import { calendarEvents } from '@/lib/email-family'
import { icsFile } from '@/lib/ics'
import { toLocale } from '@/lib/i18n/all'
import { CONTACT_EMAIL } from '@/lib/site-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* "Add to calendar" on a lesson in the dashboard (owner, 2026-10-22).
   GET ?booking=<id> -> the lesson as an .ics file. Same event (UID) as the one
   the booking emails carry, so adding it twice, or adding it here and then
   getting a "lesson moved" or "cancelled" email, still leaves one event.

   GET ?booking=<id>&format=json -> the same event as data, for the choice
   the dashboard offers (owner, 2026-11-02: Google Calendar or the iPhone's
   own): { title, location, description, start, end (ms since 1970),
   google (a Google Calendar "add event" link, filled in) }. The phone app
   cannot open an .ics file -- the web view shows its offline page -- so it
   never asks for one. */

const TZ = 'America/Los_Angeles'

/** A Los Angeles wall-clock time as ms since 1970. */
function laMs(date: string, hhmm: string): number {
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, mo - 1, d, h, mi)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(guess)).map(x => [x.type, x.value]))
  const seen = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
  return guess - (seen - guess)
}

/** 20261105T161500, the wall-clock form Google takes with ctz. */
const gStamp = (ms: number) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]))
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`
}
export async function GET(req: NextRequest) {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx
  const id = req.nextUrl.searchParams.get('booking') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid booking' }, { status: 400 })
  const lessons = await lessonCalendar(svc, parent.id, [id])
  const live = (lessons || []).filter(l => !l.cancelled)
  if (!live.length) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  const { data: p } = await svc.from('parents').select('preferred_language').eq('id', parent.id).maybeSingle()
  const L = toLocale((p as { preferred_language?: string } | null)?.preferred_language || 'en')
  const events = calendarEvents(live, L)
  if (req.nextUrl.searchParams.get('format') === 'json') {
    const e = events[0]
    const start = laMs(e.date, e.start)
    const end = start + e.minutes * 60_000
    const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${gStamp(start)}/${gStamp(end)}`, ctz: TZ,
      details: e.description || '', location: e.location || '' })
    return NextResponse.json({ title: e.title, location: e.location || '', description: e.description || '', start, end,
      google: `https://calendar.google.com/calendar/render?${q.toString()}` }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const ics = icsFile({ method: 'PUBLISH', events, organizer: { name: 'Manta Shark Aquatics', email: CONTACT_EMAIL } })
  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="swim-lesson-${live[0].date}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
