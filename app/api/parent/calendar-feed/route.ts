import { NextRequest, NextResponse, after } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { feedLinks, feedToken, isFresh } from '@/lib/calendar-feed'
import { googleCalendarOn, syncFamily } from '@/lib/google-calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The family's subscribe links for its lesson calendar (owner, 2026-11-02;
   lib/calendar-feed.ts). The schedule shows lessons, so a view-only family
   member may subscribe too -- it is the family's one link.
   GET -> { webcal, https, google, synced: a calendar read it lately or
            the person connected Google,
            googleOn: "sign in with Google" is set up (lib/google-calendar),
            googleLinked: this person has connected it }
   Opening the schedule also re-syncs the family's Google calendars when
   their last sync is over an hour old -- a catch-all behind the sync that
   follows every lesson email. */
export async function GET(req: NextRequest) {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    const googleOn = googleCalendarOn()
    const [{ token, fetchedAt }, link] = await Promise.all([
      feedToken(ctx.svc, ctx.parent.id),
      googleOn
        ? ctx.svc.from('google_calendar_links').select('id').eq('auth_user_id', ctx.user.id).eq('parent_id', ctx.parent.id).maybeSingle().then(r => r.data)
        : Promise.resolve(null),
    ])
    if (googleOn) after(() => syncFamily(ctx.svc, ctx.parent.id, { ifOlderThanMs: 3_600_000 }))
    return NextResponse.json({ ...feedLinks(req.nextUrl.origin, token), synced: isFresh(fetchedAt) || !!link, googleOn, googleLinked: !!link },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('parent/calendar-feed failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not load the calendar link' }, { status: 500 })
  }
}
