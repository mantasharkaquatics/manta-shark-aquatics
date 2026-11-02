import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { feedLinks, feedToken, isFresh } from '@/lib/calendar-feed'
import { sendRawEmail } from '@/lib/email'
import { getT, toLocale } from '@/lib/i18n/all'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

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

/* POST { action: 'email' } -> the Google link sent to the signed-in
   person's own email (owner, 2026-11-02). Google Calendar's phone app
   cannot subscribe to a link -- it opened a Google sales page -- so on a
   phone the family mails the link to itself and adds it once on a
   computer; the phone's Google Calendar then shows the lessons too.
   Only ever to the address of the person signed in. */
export async function POST(req: NextRequest) {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (body?.action !== 'email') return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const to = String(ctx.user.email || '').trim()
  if (!to) return NextResponse.json({ error: 'No email on this account' }, { status: 400 })
  try {
    const { token } = await feedToken(ctx.svc, ctx.parent.id)
    const links = feedLinks(req.nextUrl.origin, token)
    const { data: p } = await ctx.svc.from('parents').select('preferred_language').eq('id', ctx.parent.id).maybeSingle()
    const L = toLocale((p as { preferred_language?: string } | null)?.preferred_language || 'en')
    const t = getT(L)
    const html = `<div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; background: #f6f9fd; padding: 28px; border-radius: 12px;">`
      + `<div style="text-align: center; margin-bottom: 20px; color: #12254a; font-size: 18px; font-weight: 800; letter-spacing: 0.3em;">MANTA SHARK</div>`
      + `<div style="background: #fff; border-radius: 10px; padding: 26px;">`
      + `<h2 style="color: #12254a; margin-top: 0;">${esc(t('mail.calsync.title'))}</h2>`
      + `<p style="color: #16294a; line-height: 1.6;">${esc(t('mail.calsync.body'))}</p>`
      + `<div style="text-align: center; margin: 24px 0;"><a href="${esc(links.google)}" style="display: inline-block; background: #f09800; color: #12254a; font-weight: 800; padding: 14px 28px; border-radius: 10px; text-decoration: none;">${esc(t('mail.calsync.button'))}</a></div>`
      + `<p style="color: #56647d; font-size: 13px; line-height: 1.6;">${esc(t('mail.calsync.other'))}<br><span style="word-break: break-all;">${esc(links.https)}</span></p>`
      + `<p style="color: #56647d; font-size: 13px; line-height: 1.6;">${esc(t('mail.calsync.private'))}</p>`
      + `</div></div>`
    const ok = await sendRawEmail({ to, subject: t('mail.calsync.subject'), html })
    if (!ok) return NextResponse.json({ error: 'Could not send the email' }, { status: 502 })
    return NextResponse.json({ ok: true, to })
  } catch (e) {
    console.error('parent/calendar-feed email failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not send the email' }, { status: 500 })
  }
}
