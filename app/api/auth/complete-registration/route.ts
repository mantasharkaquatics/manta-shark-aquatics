import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/api-auth'
import { readJson } from '@/lib/http'
import { emailHasAccount, phoneHasAccount } from '@/lib/account-exists'
import { claimReferral } from '@/lib/referrals'
import { LEGAL_VERSIONS } from '@/lib/legal'
import { getTodayLA } from '@/lib/date'
import { isLocale } from '@/lib/i18n'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

/* The second half of sign-up: the family record (found 2026-10-05).

   The register page used to insert the parents row from the browser, gated
   only by its own "verified" flags. Nothing on the server read
   phone_otps.verified or email_otps.verified, so two calls from the console
   -- auth signUp, then the insert -- registered a stranger's email or a phone
   that was never verified, and that number then got our SMS reminders with
   no A2P opt-in behind it.

   Now the browser still creates the login (supabase.auth.signUp, so the
   session cookies work as before), and this route adds everything else:

   - the caller must be signed in, and have no parent, coach or admin row;
   - the email is the LOGIN's email, never one from the body;
   - there must be a verified, recent, unused email_otps row for that email
     and phone_otps row for the phone in the body;
   - both rows are marked used (used_at / used_by) before the insert, and
     released again if the insert fails, so the family can simply retry;
   - parents, students and the referral are written with the service key.

   The "finish registration" mode of the page (a login with no family row)
   comes here too, which is what makes that mode safe: it cannot skip the
   codes either.

   Until docs/migration-registration-server.sql is run, the otp tables have no
   used_at column. The proof is then still required (verified + recent) but
   not consumed -- harmless in practice, because a phone or email already on a
   parents row is refused below anyway. */

// How long a verified code stays good for creating the account. Codes
// themselves live ten minutes; this covers filling in the rest of the form.
const PROOF_WINDOW_MS = 60 * 60 * 1000
const MAX_STUDENTS = 3

// Same normalisation as app/api/auth/send-otp and verify-otp, so the phone
// here finds the row those routes wrote.
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return phone.startsWith('+') ? phone : '+' + digits
}

type Svc = NonNullable<Awaited<ReturnType<typeof requireUser>>>['svc']
type OtpTable = 'phone_otps' | 'email_otps'

// Postgres "undefined column": the migration has not been run yet.
function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42703' || /used_(at|by)/.test(err.message || ''))
}

async function findProof(svc: Svc, table: OtpTable, col: 'phone' | 'email', value: string):
  Promise<{ id: string | null; tracked: boolean } | { error: unknown }> {
  const since = new Date(Date.now() - PROOF_WINDOW_MS).toISOString()
  const base = () => svc.from(table).select('id')
    .eq(col, value).eq('verified', true).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(1)
  const first = await base().is('used_at', null)
  if (!first.error) return { id: first.data?.[0]?.id ?? null, tracked: true }
  if (!isMissingColumn(first.error)) return { error: first.error }
  const legacy = await base()
  if (legacy.error) return { error: legacy.error }
  return { id: legacy.data?.[0]?.id ?? null, tracked: false }
}

// Compare-and-swap on used_at: two requests racing for the same code cannot
// both win it.
async function claimProof(svc: Svc, table: OtpTable, id: string, userId: string): Promise<boolean> {
  const { data, error } = await svc.from(table)
    .update({ used_at: new Date().toISOString(), used_by: userId })
    .eq('id', id).is('used_at', null).select('id')
  return !error && !!data && data.length === 1
}

async function releaseProof(svc: Svc, table: OtpTable, id: string, userId: string) {
  const { error } = await svc.from(table).update({ used_at: null, used_by: null }).eq('id', id).eq('used_by', userId)
  if (error) console.error(`[complete-registration] could not release ${table} ${id}`, error)
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s && s.length <= max ? s : null
}

const isRealDate = (d: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const t = new Date(d + 'T00:00:00Z')
  return !isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d
}

const EMAIL_NOT_VERIFIED = { error: 'Email verification is missing or has expired. Please verify your email again.', code: 'EMAIL_NOT_VERIFIED' }
const PHONE_NOT_VERIFIED = { error: 'Phone verification is missing or has expired. Please verify your phone number again.', code: 'PHONE_NOT_VERIFIED' }
const CREATE_FAILED = { error: 'Could not create the account. Please try again.' }

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })
  const { user, svc } = auth
  const email = (user.email || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const body = await readJson(req)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const firstName = str(body.first_name, 100)
  const lastName = str(body.last_name, 100)
  const rawPhone = str(body.phone, 40)
  const address1 = str(body.address_line1, 200)
  const address2 = typeof body.address_line2 === 'string' ? body.address_line2.trim().slice(0, 200) || null : null
  const city = str(body.city, 100)
  const state = str(body.state, 2)
  const zip = str(body.zip_code, 10)
  const phone = rawPhone ? normalizePhone(rawPhone) : ''
  const today = getTodayLA()
  const students = (Array.isArray(body.students) ? body.students : [])
    .map((s: any) => ({ full_name: str(s?.full_name, 120), date_of_birth: typeof s?.date_of_birth === 'string' ? s.date_of_birth : '' }))
    .filter((s: { full_name: string | null }) => s.full_name)
  if (!firstName || !lastName || !rawPhone || phone.replace(/\D/g, '').length < 10 || !address1 || !city || !state || !zip
    || body.terms_accepted !== true || body.waiver_accepted !== true
    || students.length === 0 || students.length > MAX_STUDENTS
    || students.some((s: { date_of_birth: string }) => !isRealDate(s.date_of_birth) || s.date_of_birth > today)) {
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })
  }

  // Already done (a retry whose first answer was lost): nothing to add.
  // A staff login is not a family and cannot become one here.
  const [{ data: mine, error: mineErr }, { data: staffA, error: aErr }, { data: staffC, error: cErr }] = await Promise.all([
    svc.from('parents').select('id').eq('auth_user_id', user.id).limit(1),
    svc.from('admins').select('id').eq('auth_user_id', user.id).limit(1),
    svc.from('coaches').select('id').eq('auth_user_id', user.id).limit(1),
  ])
  if (mineErr || aErr || cErr) {
    console.error('[complete-registration] account lookup failed', mineErr || aErr || cErr)
    return NextResponse.json(CREATE_FAILED, { status: 500 })
  }
  if (mine && mine.length > 0) return NextResponse.json({ ok: true, parent_id: mine[0].id, existing: true })
  if ((staffA && staffA.length > 0) || (staffC && staffC.length > 0)) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  // The same checks send-email-otp and send-otp make, repeated here because
  // a code can be sent and verified before someone else registers the
  // address or number.
  const emailTaken = await emailHasAccount(svc, email)
  if (emailTaken === null) return NextResponse.json({ error: 'Failed to verify email. Please try again.' }, { status: 500 })
  if (emailTaken) return NextResponse.json({ error: 'This email is already registered. Please log in instead.' }, { status: 409 })
  const phoneTaken = await phoneHasAccount(svc, phone)
  if (phoneTaken === null) return NextResponse.json({ error: 'Failed to verify phone number. Please try again.' }, { status: 500 })
  if (phoneTaken) return NextResponse.json({ error: 'This phone number is already registered. Please log in instead.' }, { status: 409 })

  const emailProof = await findProof(svc, 'email_otps', 'email', email)
  if ('error' in emailProof) {
    console.error('[complete-registration] email_otps lookup failed', emailProof.error)
    return NextResponse.json(CREATE_FAILED, { status: 500 })
  }
  if (!emailProof.id) return NextResponse.json(EMAIL_NOT_VERIFIED, { status: 400 })
  const phoneProof = await findProof(svc, 'phone_otps', 'phone', phone)
  if ('error' in phoneProof) {
    console.error('[complete-registration] phone_otps lookup failed', phoneProof.error)
    return NextResponse.json(CREATE_FAILED, { status: 500 })
  }
  if (!phoneProof.id) return NextResponse.json(PHONE_NOT_VERIFIED, { status: 400 })

  // Use the codes up first, then write. A failure below hands them back.
  const claimed: { table: OtpTable; id: string }[] = []
  const release = () => Promise.all(claimed.map(c => releaseProof(svc, c.table, c.id, user.id)))
  if (emailProof.tracked) {
    if (!(await claimProof(svc, 'email_otps', emailProof.id, user.id))) return NextResponse.json(EMAIL_NOT_VERIFIED, { status: 400 })
    claimed.push({ table: 'email_otps', id: emailProof.id })
  }
  if (phoneProof.tracked) {
    if (!(await claimProof(svc, 'phone_otps', phoneProof.id, user.id))) {
      await release()
      return NextResponse.json(PHONE_NOT_VERIFIED, { status: 400 })
    }
    claimed.push({ table: 'phone_otps', id: phoneProof.id })
  }

  const now = new Date().toISOString()
  const lang = isLocale(body.preferred_language) ? body.preferred_language : 'en'
  const media = body.media_release_accepted === true
  const { data: parent, error: parentError } = await svc.from('parents').insert({
    auth_user_id: user.id,
    first_name: firstName, last_name: lastName, email, phone,
    registered_at: now, terms_accepted_at: now, terms_version: LEGAL_VERSIONS.terms,
    waiver_accepted_at: now, waiver_version: LEGAL_VERSIONS.waiver,
    media_release_accepted: media, media_release_at: media ? now : null,
    newsletter_subscribed: body.newsletter_subscribed === true, last_login_at: now,
    preferred_language: lang,
    address_line1: address1, address_line2: address2,
    city, state: state.toUpperCase(), zip_code: zip,
  }).select('id').single()
  if (parentError || !parent) {
    console.error('[complete-registration] parents insert failed', parentError)
    await release()
    return NextResponse.json(CREATE_FAILED, { status: 500 })
  }

  // The account exists from here on: a swimmer that fails to save is
  // reported, not fatal -- the page opens My Account with the add form.
  const { error: stuErr } = await svc.from('students').insert(students.map((s: { full_name: string; date_of_birth: string }, i: number) => ({
    parent_id: parent.id, full_name: s.full_name, date_of_birth: s.date_of_birth,
    current_level: null, is_active: true, sort_order: i + 1,
  })))
  if (stuErr) console.error('[complete-registration] students insert failed', stuErr)

  // Best effort, as before: lib/referrals enforces the rules.
  const refCode = typeof body.referral_code === 'string' ? body.referral_code.trim() : ''
  if (refCode) {
    try {
      const r = await claimReferral(svc, parent.id, refCode)
      if (!r.ok) console.warn('[complete-registration] referral not applied', r)
    } catch (e) {
      console.error('[complete-registration] referral claim failed', e)
    }
  }

  // Welcome email (owner, 2026-10-06). Only here, on the first creation --
  // the early "already done" return above never sends a second one. A failed
  // send is logged and does not touch the account.
  try {
    const sent = await sendEmail({
      type: 'welcome', to: email, parentName: firstName, lang,
      studentNames: stuErr ? [] : students.map((s: { full_name: string }) => s.full_name),
    })
    if (!sent) console.error('[complete-registration] welcome email not sent', parent.id)
  } catch (e) {
    console.error('[complete-registration] welcome email failed', e)
  }

  return NextResponse.json({ ok: true, parent_id: parent.id, student_failed: !!stuErr })
}
