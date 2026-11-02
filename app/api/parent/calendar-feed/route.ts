import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireParent } from '@/lib/api-auth'
import { feedLinks, feedToken, isFresh } from '@/lib/calendar-feed'
import { sendRawEmail } from '@/lib/email'
import { getT, toLocale } from '@/lib/i18n/all'

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Person = { id: string; name: string; email: string; role: 'main' | 'full' | 'viewer' }

/** Everyone in the family who has an email: the main account, the second
 *  guardian, the view-only members. */
async function familyPeople(svc: SupabaseClient, parent: { id: string; email: string | null; first_name: string | null }): Promise<Person[]> {
  const out: Person[] = []
  if (parent.email) out.push({ id: 'main', name: parent.first_name || '', email: parent.email, role: 'main' })
  type G = { id: string; email: string; first_name: string | null; role?: string }
  const withRole = await svc.from('parent_guardians').select('id, email, first_name, role').eq('parent_id', parent.id).is('removed_at', null)
  // No role column yet: every guardian is a full one.
  const gs = (withRole.error
    ? (await svc.from('parent_guardians').select('id, email, first_name').eq('parent_id', parent.id).is('removed_at', null)).data
    : withRole.data) as G[] | null
  for (const g of gs || []) {
    if (g.email) out.push({ id: g.id, name: g.first_name || '', email: g.email, role: g.role === 'viewer' ? 'viewer' : 'full' })
  }
  return out
}

/** bob.smith@gmail.com -> bob•••@gmail.com: enough to tell the family's
 *  addresses apart, not to hand anyone a whole address. */
const mask = (email: string) => { const [u, d] = email.split('@'); return `${u.slice(0, 3)}•••@${d || ''}` }

/* The family's subscribe links for its lesson calendar (owner, 2026-11-02;
   lib/calendar-feed.ts). The schedule shows lessons, so a view-only family
   member may subscribe too -- it is the family's one link.
   GET -> { webcal, https, google, synced: a calendar read it lately,
            people: [{ id, name, email (masked but your own), role, me }] } */
export async function GET(req: NextRequest) {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    const { token, fetchedAt } = await feedToken(ctx.svc, ctx.parent.id)
    const me = ctx.guardianId || 'main'
    const people = (await familyPeople(ctx.svc, ctx.parent)).map(x => ({ id: x.id, name: x.name, role: x.role, me: x.id === me, email: x.id === me ? x.email : mask(x.email) }))
    return NextResponse.json({ ...feedLinks(req.nextUrl.origin, token), synced: isFresh(fetchedAt), people }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('parent/calendar-feed failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not load the calendar link' }, { status: 500 })
  }
}

/* POST { action: 'email', to?: [person ids] } -> the Google link mailed to
   the chosen family members (owner, 2026-11-02). Google Calendar's phone app
   cannot subscribe to a link -- it opened a Google sales page -- so on a
   phone the family mails the link and adds it once on a computer; the
   phone's Google Calendar then shows the lessons too. A parent may send it
   to the second guardian or the grandparents as well (owner, same day), so
   they need not sign in themselves. Only ever to the family's own
   addresses; without `to`, to the person signed in. */
export async function POST(req: NextRequest) {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (body?.action !== 'email') return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  try {
    const people = await familyPeople(ctx.svc, ctx.parent)
    const me = ctx.guardianId || 'main'
    const asked: string[] = Array.isArray(body.to) && body.to.length ? body.to.map(String) : [me]
    const pick = people.filter(x => asked.includes(x.id))
    // The signed-in person's own login address, when theirs is not listed.
    if (!pick.length && asked.includes(me) && ctx.user.email) pick.push({ id: me, name: '', email: ctx.user.email, role: 'main' })
    if (!pick.length) return NextResponse.json({ error: 'No one to send to' }, { status: 400 })
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
    const sent: string[] = []
    for (const x of pick) {
      if (await sendRawEmail({ to: x.email, subject: t('mail.calsync.subject'), html })) sent.push(x.id === me ? x.email : mask(x.email))
    }
    if (!sent.length) return NextResponse.json({ error: 'Could not send the email' }, { status: 502 })
    return NextResponse.json({ ok: true, sent, to: sent.join(', ') })
  } catch (e) {
    console.error('parent/calendar-feed email failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not send the email' }, { status: 500 })
  }
}
