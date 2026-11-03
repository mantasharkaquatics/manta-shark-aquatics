import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { authUrl, googleCalendarOn, makeState } from '@/lib/google-calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The Google sign-in page for connecting the lesson calendar (owner,
   2026-11-02; lib/google-calendar.ts). Answers with the URL rather than a
   redirect: the page sends the browser there itself, and inside the app that
   hands Google's page to Safari (Google refuses to sign in inside an app's
   web view). The signed state carries who asked, since Safari has no
   session of ours. GET ?app=1 -> { url } */
export async function GET(req: NextRequest) {
  if (!googleCalendarOn()) return NextResponse.json({ error: 'Not available' }, { status: 404 })
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const state = makeState(ctx.parent.id, ctx.user.id, req.nextUrl.searchParams.get('app') === '1')
  return NextResponse.json({ url: authUrl(req.nextUrl.origin, state) }, { headers: { 'Cache-Control': 'no-store' } })
}
