import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { feedLinks, feedToken, isFresh } from '@/lib/calendar-feed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The family's subscribe links for its lesson calendar (owner, 2026-11-02;
   lib/calendar-feed.ts). The schedule shows lessons, so a view-only family
   member may subscribe too -- it is the family's one link.
   GET -> { webcal, https, google, synced: a calendar read it lately } */
export async function GET(req: NextRequest) {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    const { token, fetchedAt } = await feedToken(ctx.svc, ctx.parent.id)
    return NextResponse.json({ ...feedLinks(req.nextUrl.origin, token), synced: isFresh(fetchedAt) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('parent/calendar-feed failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not load the calendar link' }, { status: 500 })
  }
}
