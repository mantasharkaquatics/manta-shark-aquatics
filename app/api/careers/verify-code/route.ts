import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { getApplicant, sha256 } from '@/lib/applicant-auth'
import { takeSlot, ipHash } from '@/lib/ip-rate-limit'

export const runtime = 'nodejs'

const MAX_ATTEMPTS = 5
// Code guesses one network may make in an hour (found 2026-10-07): applicant
// accounts are free to make, so the per-code cap alone is no limit on volume.
const MAX_PER_IP_PER_HOUR = 30

export async function POST(req: Request) {
  const applicant = await getApplicant()
  if (!applicant) {
    return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const channel = body.channel === 'email' ? 'email' : body.channel === 'phone' ? 'phone' : null
  const code = String(body.code ?? '').trim()

  if (!channel || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 })
  }

  const supabase = serviceClient()

  const slot = await takeSlot(supabase, 'careers-verify-code', ipHash(req), MAX_PER_IP_PER_HOUR, 60 * 60 * 1000)
  if (slot.result === 'error') {
    return NextResponse.json({ error: 'Could not verify that code. Please try again.' }, { status: 500 })
  }
  if (slot.result === 'limited') {
    return NextResponse.json({ error: 'Too many attempts from this network. Please try again later.' }, { status: 429 })
  }

  const { data: record } = await supabase
    .from('applicant_verifications')
    .select('id, code_hash, destination, expires_at, consumed_at, attempt_count')
    .eq('applicant_id', applicant.id)
    .eq('channel', channel)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!record) {
    return NextResponse.json(
      { error: 'No active code. Please request a new one.' },
      { status: 400 }
    )
  }

  if (record.attempt_count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: 'Too many incorrect attempts. Please request a new code.' },
      { status: 429 }
    )
  }

  if (new Date(record.expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'That code has expired. Please request a new one.' },
      { status: 400 }
    )
  }

  // Spend the attempt BEFORE comparing, as a compare-and-swap on the count
  // just read (found 2026-10-07). Writing read + 1 after a wrong guess let a
  // burst of simultaneous guesses all read the same count, so five attempts
  // became five waves. Now only one request per value of the counter is
  // compared; the rest are turned away unchecked.
  const attempts = (record.attempt_count ?? 0) + 1
  let bump = supabase
    .from('applicant_verifications')
    .update({ attempt_count: attempts })
    .eq('id', record.id)
    .is('consumed_at', null)
  bump = record.attempt_count == null ? bump.is('attempt_count', null) : bump.eq('attempt_count', record.attempt_count)
  const { data: claimed, error: bumpError } = await bump.select('id')
  if (bumpError || !claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'Could not verify that code. Please try again.' }, { status: 409 })
  }

  if (record.code_hash !== sha256(code)) {
    const left = MAX_ATTEMPTS - attempts
    return NextResponse.json(
      {
        error:
          left > 0
            ? `That code is not correct. ${left} ${left === 1 ? 'attempt' : 'attempts'} remaining.`
            : 'Too many incorrect attempts. Please request a new code.',
      },
      { status: 400 }
    )
  }

  await supabase
    .from('applicant_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', record.id)

  const column = channel === 'email' ? 'email_verified_at' : 'phone_verified_at'
  const { error: updateError } = await supabase
    .from('applicants')
    .update({ [column]: new Date().toISOString(), [channel]: record.destination })
    .eq('id', applicant.id)

  if (updateError) {
    return NextResponse.json(
      { error: 'Your code was correct but we could not save it. Please try again.' },
      { status: 500 }
    )
  }

  const emailDone = channel === 'email' || Boolean(applicant.email_verified_at)
  const phoneDone = channel === 'phone' || Boolean(applicant.phone_verified_at)

  return NextResponse.json({ ok: true, fullyVerified: emailDone && phoneDone })
}
