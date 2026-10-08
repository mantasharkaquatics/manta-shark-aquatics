import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { sendEmail } from '@/lib/email'
import { emailIlikePattern, sameEmail } from '@/lib/account-exists'
import { takeSlots, releaseSlot, ipHash, keyHash } from '@/lib/ip-rate-limit'
import { isLocale } from '@/lib/i18n'

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
// Reserve-first fences (found 2026-10-07). The gap above is read from
// recovery_sent_at before the link is made, so a burst of requests all read
// the same old time and each sent an email; and nothing limited one network
// working through a list of customer addresses, which also spends the Resend
// quota every other email depends on. Over any limit the answer is still the
// quiet "ok" -- refusing would tell a stranger the address is a customer.
const MAX_PER_EMAIL_PER_DAY = 5
const MAX_PER_IP_PER_HOUR = 10

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const email = String(body.email || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const svc = serviceClient()

  // Before the account lookup, so addresses with no account are counted too.
  const emailKey = keyHash('email', email)
  const slots = await takeSlots(svc, [
    { scope: 'forgot-password-ip', key: ipHash(req), max: MAX_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 },
    { scope: 'forgot-password-cooldown', key: emailKey, max: 1, windowMs: RESEND_GAP_MS },
    { scope: 'forgot-password-day', key: emailKey, max: MAX_PER_EMAIL_PER_DAY, windowMs: 24 * 60 * 60 * 1000 },
  ])
  if (slots.result === 'error') {
    return NextResponse.json({ error: 'Could not send the email. Please try again.' }, { status: 502 })
  }
  if (slots.result === 'limited') return NextResponse.json({ ok: true })
  const giveBack = async () => { for (const id of slots.ids) await releaseSlot(svc, id) }

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

  let token: string | undefined
  if (person?.auth_user_id) {
    const { data: authUser } = await svc.auth.admin.getUserById(person.auth_user_id)
    const lastSent = (authUser?.user as any)?.recovery_sent_at
    if (lastSent && Date.now() - new Date(lastSent).getTime() < RESEND_GAP_MS) {
      return NextResponse.json({ ok: true })
    }
    const { data: link, error } = await svc.auth.admin.generateLink({ type: 'recovery', email })
    token = link?.properties?.hashed_token
    if (error) console.error('[forgot-password] generateLink failed', error)
  } else {
    /* A half-registered family (found 2026-10-08): signUp made the login, but
       the family row was never written (the codes expired, or the page was
       closed while "Creating..."). They have no parents row, so this route
       used to send nothing -- and registering again said "already has an
       account". A login with no parent/admin row that is not a coach gets the
       link too; after the reset, signing in sends them to /register?finish=1
       to add the family record. generateLink is also the lookup: it fails for
       an address with no login, and that stays the quiet "ok". */
    const { data: coachRows } = await svc.from('coaches').select('email').ilike('email', emailIlikePattern(email)).limit(20)
    if ((coachRows as { email: string | null }[] | null)?.some(r => sameEmail(r.email, email))) return NextResponse.json({ ok: true })
    const { data: link, error } = await svc.auth.admin.generateLink({ type: 'recovery', email })
    if (error || !link?.user) {
      if (error && error.status !== 404) console.error('[forgot-password] generateLink (no family row) failed', error)
      return NextResponse.json({ ok: true })
    }
    // A coach's login under another address on the coaches row: still left out.
    const { data: coachById } = await svc.from('coaches').select('id').eq('auth_user_id', link.user.id).limit(1)
    if (coachById && coachById.length > 0) return NextResponse.json({ ok: true })
    token = link.properties?.hashed_token
    person = { auth_user_id: link.user.id, first_name: null, email, preferred_language: isLocale(body.lang) ? body.lang : 'en' }
  }
  if (!token) {
    await giveBack()
    return NextResponse.json({ error: 'Could not send the email. Please try again.' }, { status: 502 })
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
  const resetUrl = `${origin}/reset-password?token_hash=${encodeURIComponent(token)}`
  const sent = await sendEmail({
    type: 'parent_password_reset',
    to: email,
    parentName: person?.first_name || '',
    resetUrl,
    lang: person?.preferred_language || 'en',
  })
  if (!sent) {
    await giveBack()
    return NextResponse.json({ error: 'Could not send the email. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
