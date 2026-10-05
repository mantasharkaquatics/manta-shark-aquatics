import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { sendEmail } from '@/lib/email'
import { emailIlikePattern, sameEmail } from '@/lib/account-exists'

export const runtime = 'nodejs'

/* "Forgot password" on the sign-in page (owner, 2026-09-26).

   The parent types their email; if it belongs to a family (or an admin) we
   send a link that opens /reset-password on this site, where they choose a new
   password. The link carries a Supabase recovery token: single use, and it
   expires after an hour. We send the email ourselves through Resend, in the
   family's own language, instead of relying on Supabase's built-in mailer.

   The answer is always "ok", whether or not the address has an account --
   anything else would let a stranger test which emails are customers. For the
   same reason a second request within a minute is quietly not sent rather than
   refused. Coaches are left out: they sign in with a PIN, not a password. */

const RESEND_GAP_MS = 60_000

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const email = String(body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const svc = serviceClient()

  // Exact match only (found 2026-10-05): a raw ilike let "%" and "_" act as
  // wildcards, so "%@gmail.com" would reset whichever account matched first.
  // See emailIlikePattern in lib/account-exists for why it is ilike + compare.
  type Person = { auth_user_id: string | null; first_name: string | null; email: string | null; preferred_language?: string | null }
  let person: Person | null = null
  const { data: parents } = await svc.from('parents')
    .select('auth_user_id, first_name, email, preferred_language').ilike('email', emailIlikePattern(email)).limit(20)
  const parent = (parents as Person[] | null)?.find(r => sameEmail(r.email, email))
  if (parent?.auth_user_id) person = parent
  else {
    const { data: admins } = await svc.from('admins')
      .select('auth_user_id, first_name, email').ilike('email', emailIlikePattern(email)).limit(20)
    const admin = (admins as Person[] | null)?.find(r => sameEmail(r.email, email))
    if (admin?.auth_user_id) person = admin
  }
  if (!person?.auth_user_id) return NextResponse.json({ ok: true })

  const { data: authUser } = await svc.auth.admin.getUserById(person.auth_user_id)
  const lastSent = (authUser?.user as any)?.recovery_sent_at
  if (lastSent && Date.now() - new Date(lastSent).getTime() < RESEND_GAP_MS) {
    return NextResponse.json({ ok: true })
  }

  const { data: link, error } = await svc.auth.admin.generateLink({ type: 'recovery', email })
  const token = link?.properties?.hashed_token
  if (error || !token) {
    console.error('[forgot-password] generateLink failed', error)
    return NextResponse.json({ error: 'Could not send the email. Please try again.' }, { status: 502 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const resetUrl = `${origin}/reset-password?token_hash=${encodeURIComponent(token)}`
  const sent = await sendEmail({
    type: 'parent_password_reset',
    to: email,
    parentName: person.first_name || '',
    resetUrl,
    lang: person.preferred_language || 'en',
  })
  if (!sent) return NextResponse.json({ error: 'Could not send the email. Please try again.' }, { status: 502 })

  return NextResponse.json({ ok: true })
}
