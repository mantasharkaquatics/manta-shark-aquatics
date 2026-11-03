import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { exchangeCode, GOOGLE_CAL_SCOPE, googleCalendarOn, idClaims, MAX_GOOGLE_PER_PERSON, readState, syncFamily } from '@/lib/google-calendar'
import { getT, toLocale } from '@/lib/i18n/all'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/* Where Google sends the family back after "Allow" (lib/google-calendar.ts).
   No session needed: the signed state says who asked. Saves the refresh
   token, makes the calendar and fills it, then shows a small page -- inside
   the app this is Safari, so it says to go back to the app. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const st = readState(q.get('state') || '')
  const svc = serviceClient()
  let L = toLocale('en')
  if (st) {
    const { data: p } = await svc.from('parents').select('preferred_language').eq('id', st.parentId).maybeSingle()
    L = toLocale((p as { preferred_language?: string } | null)?.preferred_language || 'en')
  }
  const t = getT(L)
  const page = (ok: boolean) => {
    const title = ok ? t('gcal.done.title') : t('gcal.fail.title')
    const body = ok ? (st?.app ? t('gcal.done.app') : t('gcal.done.body')) : t('gcal.fail.body')
    const back = st?.app ? '' : `<a href="/dashboard/schedule" style="display:inline-block;margin-top:22px;background:#f09800;color:#12254a;font-weight:800;padding:13px 26px;border-radius:12px;text-decoration:none">${esc(t('gcal.back'))}</a>`
    const html = `<!doctype html><html lang="${L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manta Shark</title></head>`
      + `<body style="margin:0;font-family:-apple-system,'PingFang TC','Noto Sans TC',sans-serif;background:#e9eff7;color:#16294a;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;box-sizing:border-box">`
      + `<div style="background:#fff;border-radius:18px;padding:30px 24px;max-width:380px;width:100%;text-align:center">`
      + `<div style="font-size:42px">${ok ? '✅' : '⚠️'}</div><h1 style="font-size:20px;margin:10px 0 8px">${esc(title)}</h1>`
      + `<p style="font-size:15px;line-height:1.6;color:#56647d;margin:0">${esc(body)}</p>${back}</div></body></html>`
    return new NextResponse(html, { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  // The family pressed Cancel on Google's page, or the link is old.
  if (!googleCalendarOn() || !st || q.get('error') || !q.get('code')) return page(false)
  try {
    const tok = await exchangeCode(req.nextUrl.origin, q.get('code')!)
    if (!tok.refresh_token || !String(tok.scope || '').includes(GOOGLE_CAL_SCOPE)) {
      console.warn('google calendar callback: no refresh token or scope not granted')
      return page(false)
    }
    const who = idClaims(tok.id_token)
    if (!who) { console.warn('google calendar callback: no account id in the token'); return page(false) }
    // Up to MAX_GOOGLE_PER_PERSON Google accounts per login; the same one
    // again is not a new one.
    const { data: mine } = await svc.from('google_calendar_links').select('google_sub').eq('auth_user_id', st.userId)
    const subs = ((mine || []) as { google_sub: string | null }[]).map(r => r.google_sub)
    if (!subs.includes(who.sub) && subs.length >= MAX_GOOGLE_PER_PERSON) {
      console.warn('google calendar callback: already at the limit of accounts')
      return page(false)
    }
    const { data: row, error } = await svc.from('google_calendar_links').upsert(
      // Not calendar_id: someone connecting the same account again keeps the
      // calendar they already have, rather than getting a second one.
      { parent_id: st.parentId, auth_user_id: st.userId, google_sub: who.sub, google_email: who.email, refresh_token: tok.refresh_token, last_error: null },
      { onConflict: 'auth_user_id,google_sub' }).select('id').single()
    if (error || !row) throw new Error(error?.message || 'no row')
    await syncFamily(svc, st.parentId, { linkId: (row as { id: string }).id })
    return page(true)
  } catch (e) {
    console.error('google calendar callback failed:', e instanceof Error ? e.message : e)
    return page(false)
  }
}
