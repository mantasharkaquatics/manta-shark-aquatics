import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken } from '@/lib/unsubscribe'

export const runtime = 'nodejs'

/* Turns a family's marketing email off (lib/unsubscribe.ts).

   Two callers, one action:
   - the button on /unsubscribe posts a form (p, t) and is sent back to the
     page, which then says it is done;
   - a mail app's own "Unsubscribe" button posts List-Unsubscribe=One-Click to
     the URL in the List-Unsubscribe header, with p and t in the query, and
     only needs a 200.
   No login: the signed token is what proves the link came from our email. */

export async function POST(req: NextRequest) {
  let p = req.nextUrl.searchParams.get('p') || ''
  let t = req.nextUrl.searchParams.get('t') || ''
  let fromPage = false
  const type = req.headers.get('content-type') || ''
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (form?.get('p')) { p = String(form.get('p')); t = String(form.get('t') || ''); fromPage = true }
  }
  if (!verifyUnsubscribeToken(p, t)) {
    return fromPage
      ? NextResponse.redirect(new URL(`/unsubscribe?error=1`, req.url), 303)
      : NextResponse.json({ error: 'Invalid link' }, { status: 400 })
  }

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { error } = await svc.from('parents').update({ newsletter_subscribed: false }).eq('id', p)
  if (error) {
    console.error('unsubscribe failed:', error.message)
    return fromPage
      ? NextResponse.redirect(new URL(`/unsubscribe?p=${encodeURIComponent(p)}&t=${encodeURIComponent(t)}&error=1`, req.url), 303)
      : NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
  return fromPage
    ? NextResponse.redirect(new URL(`/unsubscribe?p=${encodeURIComponent(p)}&t=${encodeURIComponent(t)}&done=1`, req.url), 303)
    : NextResponse.json({ ok: true })
}
