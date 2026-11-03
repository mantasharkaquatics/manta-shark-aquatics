import { NextRequest, NextResponse, after } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { deviceFeedToken, deviceFresh, feedLinks, feedToken, isFresh } from '@/lib/calendar-feed'
import { googleCalendarOn, MAX_GOOGLE_PER_PERSON, syncFamily } from '@/lib/google-calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The subscribe links for the family's lesson calendar (owner, 2026-11-02;
   lib/calendar-feed.ts) and what is synced, for the card on the schedule.
   The schedule shows lessons, so a view-only family member may use it too.

   GET ?device=<id the browser keeps>
   -> { webcal, https, google: this phone's own link (the family's when no
            device id came),
        appleSynced: a calendar read that link in the last 3 days -- the ✓
            on 「iPhone 行事曆」 (owner, 2026-11-03),
        googleOn: "sign in with Google" is set up (lib/google-calendar),
        googleAccounts: [{ id, email }] this person connected -- the ✓ on
            「Google 日曆」 and one 停止 each, googleMax,
        synced: either of the two -- the folded line's ✓ }
   Opening the schedule also re-syncs the family's Google calendars when
   their last sync is over an hour old -- a catch-all behind the sync that
   follows every lesson email. */
export async function GET(req: NextRequest) {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const raw = req.nextUrl.searchParams.get('device') || ''
  const device = /^[A-Za-z0-9_-]{8,64}$/.test(raw) ? raw : null
  try {
    const googleOn = googleCalendarOn()
    const [{ token, fetchedAt }, links] = await Promise.all([
      device ? deviceFeedToken(ctx.svc, ctx.parent.id, device) : feedToken(ctx.svc, ctx.parent.id),
      googleOn
        ? ctx.svc.from('google_calendar_links').select('id, google_email').eq('auth_user_id', ctx.user.id).eq('parent_id', ctx.parent.id)
          .order('created_at').then(r => (r.data || []) as { id: string; google_email: string | null }[])
        : Promise.resolve([]),
    ])
    if (googleOn) after(() => syncFamily(ctx.svc, ctx.parent.id, { ifOlderThanMs: 3_600_000 }))
    const appleSynced = device ? deviceFresh(fetchedAt) : isFresh(fetchedAt)
    const googleAccounts = links.map(l => ({ id: l.id, email: l.google_email }))
    return NextResponse.json({
      ...feedLinks(req.nextUrl.origin, token),
      appleSynced, googleOn, googleAccounts, googleMax: MAX_GOOGLE_PER_PERSON,
      googleLinked: googleAccounts.length > 0,
      synced: appleSynced || googleAccounts.length > 0,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('parent/calendar-feed failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not load the calendar link' }, { status: 500 })
  }
}
