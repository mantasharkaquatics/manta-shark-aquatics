import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import {
  normalizeEmail,
  verifyPassword,
  hashPassword,
  createSession,
} from '@/lib/applicant-auth'
import { takeSlot, releaseSlot, ipHash } from '@/lib/ip-rate-limit'

export const runtime = 'nodejs'

const MAX_FAILED = 8
const LOCK_MINUTES = 15
const GENERIC = 'Email or password is incorrect.'
const TRY_AGAIN = 'Could not sign you in. Please try again.'
// Said on the guess that locks the account, not only on the next one, and it
// names the way out (found 2026-10-08): a reset works straight away.
const LOCKED = `Too many failed attempts, so sign-in is paused for ${LOCK_MINUTES} minutes. You can reset your password now with "Forgot your password?" below.`
// Wrong guesses one network may make in an hour, across all accounts (found
// 2026-10-07): the per-account lockout below never slowed a script working
// through many applicants' emails. A successful sign-in gives its slot back.
const MAX_FAILED_PER_IP_PER_HOUR = 30

function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for')
  return fwd ? fwd.split(',')[0].trim() : null
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const email = normalizeEmail(String(body.email ?? ''))
  const password = String(body.password ?? '')
  if (!email || !password) {
    return NextResponse.json({ error: GENERIC }, { status: 401 })
  }

  const supabase = serviceClient()

  const slot = await takeSlot(supabase, 'careers-login', ipHash(req), MAX_FAILED_PER_IP_PER_HOUR, 60 * 60 * 1000)
  if (slot.result === 'error') {
    return NextResponse.json({ error: TRY_AGAIN }, { status: 500 })
  }
  if (slot.result === 'limited') {
    return NextResponse.json(
      { error: 'Too many sign-in attempts from this network. Please try again later.' },
      { status: 429 }
    )
  }

  const { data: applicant } = await supabase
    .from('applicants')
    .select('id, password_hash, failed_login_count, locked_until')
    .eq('email', email)
    .maybeSingle()

  if (!applicant) {
    await hashPassword(password)
    return NextResponse.json({ error: GENERIC }, { status: 401 })
  }

  if (applicant.locked_until && new Date(applicant.locked_until).getTime() > Date.now()) {
    return NextResponse.json({ error: LOCKED }, { status: 429 })
  }

  // Count the attempt BEFORE checking the password, as a compare-and-swap on
  // the value just read (found 2026-10-07). Counting after, with a plain
  // write of read + 1, let a wave of fifty simultaneous guesses all read the
  // same count and all write the same next value -- fifty guesses for one
  // failure, so the lockout took about 400 guesses to reach. Now only one
  // request per value of the counter wins; the others are turned away before
  // the password is compared, so every compared guess is counted. A correct
  // password sets the count back to 0 below.
  //
  // A lock that has run out starts the count again from 0 (found
  // 2026-10-08): the count used to stay at 8, so after the 15 minutes every
  // single wrong guess was 9, 10, ... and locked the account again at once.
  // The compare-and-swap below still matches the stored value.
  const before = applicant.failed_login_count ?? 0
  const lockExpired = !!applicant.locked_until && new Date(applicant.locked_until).getTime() <= Date.now()
  const failed = (lockExpired ? 0 : before) + 1
  let bump = supabase
    .from('applicants')
    .update({
      failed_login_count: failed,
      locked_until:
        failed >= MAX_FAILED
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
          : null,
    })
    .eq('id', applicant.id)
  bump = applicant.failed_login_count == null
    ? bump.is('failed_login_count', null)
    : bump.eq('failed_login_count', before)
  const { data: claimed, error: bumpError } = await bump.select('id')
  if (bumpError || !claimed || claimed.length === 0) {
    return NextResponse.json({ error: TRY_AGAIN }, { status: 409 })
  }

  const valid = await verifyPassword(password, applicant.password_hash)

  if (!valid) {
    if (failed >= MAX_FAILED) return NextResponse.json({ error: LOCKED }, { status: 429 })
    return NextResponse.json({ error: GENERIC }, { status: 401 })
  }

  await releaseSlot(supabase, slot.id)

  await supabase
    .from('applicants')
    .update({
      failed_login_count: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
    })
    .eq('id', applicant.id)

  await createSession(applicant.id, {
    ip: clientIp(req),
    userAgent: req.headers.get('user-agent'),
  })

  return NextResponse.json({ ok: true })
}
