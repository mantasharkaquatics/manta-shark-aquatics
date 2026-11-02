import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { feedIcs } from '@/lib/calendar-feed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The family's lesson calendar, read by Google Calendar or the iPhone after
   the family subscribes (owner, 2026-11-02; lib/calendar-feed.ts). No login:
   a calendar cannot sign in, so the long random token in the path is the
   key. /api/calendar/feed/<token>.ics */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params
  const token = raw.replace(/\.ics$/i, '')
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new NextResponse('Not found', { status: 404 })
  try {
    const ics = await feedIcs(serviceClient(), token)
    if (ics === null) return new NextResponse('Not found', { status: 404 })
    return new NextResponse(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="manta-shark-lessons.ics"',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    })
  } catch (e) {
    console.error('calendar feed failed:', e instanceof Error ? e.message : e)
    return new NextResponse('Try again later', { status: 500 })
  }
}
