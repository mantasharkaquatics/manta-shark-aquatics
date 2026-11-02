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
   getting a "lesson moved" or "cancelled" email, still leaves one event. */
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
  const ics = icsFile({ method: 'PUBLISH', events: calendarEvents(live, L), organizer: { name: 'Manta Shark Aquatics', email: CONTACT_EMAIL } })
  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="swim-lesson-${live[0].date}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
