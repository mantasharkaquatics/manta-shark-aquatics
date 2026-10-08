import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { normalizeEmail, sha256, hashPassword, passwordProblem } from '@/lib/applicant-auth'
import { takeSlot, ipHash } from '@/lib/ip-rate-limit'

export const runtime = 'nodejs'

const MAX_ATTEMPTS = 5
// Code guesses one network may make in an hour, across all applicants (found
// 2026-10-07). This route needs no sign-in, so the per-code cap below is the
// only other fence.
const MAX_PER_IP_PER_HOUR = 20

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const email = normalizeEmail(String(body.email || ''))
  const code = String(body.code || '').trim()
  const password = String(body.password || '')

  if (!email || !code) {
    return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })
  }

  const problem = passwordProblem(password)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const svc = serviceClient()

  const slot = await takeSlot(svc, 'careers-reset-password', ipHash(req), MAX_PER_IP_PER_HOUR, 60 * 60 * 1000)
  if (slot.result === 'error') {
    return NextResponse.json({ error: 'Could not check the code. Please try again.' }, { status: 500 })
  }
  if (slot.result === 'limited') {
    return NextResponse.json({ error: 'Too many attempts from this network. Please try again later.' }, { status: 429 })
  }

  const { data: applicant } = await svc
    .from('applicants')
    .select('id, email, email_verified_at')
    .eq('email', email)
    .maybeSingle()

  if (!applicant) {
    return NextResponse.json({ error: 'That code is not valid.' }, { status: 400 })
  }

  const { data: record } = await svc
    .from('applicant_verifications')
    .select('id, code_hash, destination, expires_at, consumed_at, attempt_count')
    .eq('applicant_id', applicant.id)
    .eq('channel', 'password_reset')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!record || record.consumed_at) {
    return NextResponse.json({ error: 'That code is not valid.' }, { status: 400 })
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'That code has expired. Request a new one.' }, { status: 400 })
  }
  if ((record.attempt_count || 0) >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many attempts. Request a new code.' }, { status: 429 })
  }

  // Spend the attempt BEFORE comparing, as a compare-and-swap on the count
  // just read (found 2026-10-07, the same fix as the parent verify-otp).
  // Writing read + 1 after a wrong guess let hundreds of simultaneous guesses
  // all read 0 and all write 1, so the five-attempt cap barely counted. Now
  // only one request per value of the counter is compared; the rest are
  // turned away unchecked.
  const spent = record.attempt_count || 0
  let bump = svc
    .from('applicant_verifications')
    .update({ attempt_count: spent + 1 })
    .eq('id', record.id)
    .is('consumed_at', null)
  bump = record.attempt_count == null ? bump.is('attempt_count', null) : bump.eq('attempt_count', spent)
  const { data: claimed, error: bumpError } = await bump.select('id')
  if (bumpError || !claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'Could not check the code. Please try again.' }, { status: 409 })
  }

  if (record.code_hash !== sha256(code)) {
    return NextResponse.json({ error: 'That code is not valid.' }, { status: 400 })
  }

  const now = new Date().toISOString()

  // The code reached this inbox, which proves the address: an account that
  // signed up and never verified its email is verified now (found
  // 2026-10-08 -- such accounts can request a reset since then). Only when the
  // code went to the address the account holds today.
  const provesEmail = !applicant.email_verified_at && record.destination === applicant.email
  const base = {
    password_hash: await hashPassword(password),
    failed_login_count: 0,
    locked_until: null,
  }
  // An unverified account reclaimed this way may have been opened by someone
  // else with this address (found 2026-10-08): their name and their phone --
  // verified with their own text -- stayed on it, so the owner's application
  // went in under the stranger's name and number. Nothing on the account but
  // the address is known to be the owner's, so the rest is cleared and asked
  // for again on the verify page (/api/careers/me reports what is missing).
  const reclaim = provesEmail
    ? { email_verified_at: now, phone_verified_at: null, legal_first_name: '', legal_last_name: '', phone: '' }
    : {}
  let { error: saveError } = await svc
    .from('applicants')
    .update({ ...base, ...reclaim })
    .eq('id', applicant.id)
  if (saveError && provesEmail) {
    // Should a column refuse an empty value, the phone is still unverified
    // and has to be texted again before the form opens.
    console.error('careers reset: could not clear the reclaimed account', saveError)
    ;({ error: saveError } = await svc
      .from('applicants')
      .update({ ...base, email_verified_at: now, phone_verified_at: null })
      .eq('id', applicant.id))
  }
  if (saveError) {
    console.error('careers reset: password update failed', saveError)
    return NextResponse.json({ error: 'Could not save your new password. Please try again.' }, { status: 500 })
  }
  if (provesEmail) {
    // Codes sent to the stranger's phone die with the number.
    await svc
      .from('applicant_verifications')
      .update({ consumed_at: now })
      .eq('applicant_id', applicant.id)
      .eq('channel', 'phone')
      .is('consumed_at', null)
  }

  await svc
    .from('applicant_verifications')
    .update({ consumed_at: now })
    .eq('id', record.id)

  // Whoever knew the old password is signed out everywhere.
  await svc
    .from('applicant_sessions')
    .update({ revoked_at: now })
    .eq('applicant_id', applicant.id)
    .is('revoked_at', null)

  return NextResponse.json({ ok: true })
}
