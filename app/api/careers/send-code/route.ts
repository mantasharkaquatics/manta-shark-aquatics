import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { sendSms, SMS_COMPLIANCE_SUFFIX } from '@/lib/sms'
import { getApplicant, generateCode, sha256 } from '@/lib/applicant-auth'
import { takeSlots, releaseSlot, ipHash, keyHash } from '@/lib/ip-rate-limit'

export const runtime = 'nodejs'

const CODE_TTL_MINUTES = 10
const RESEND_COOLDOWN_SECONDS = 60
// Fences on top of the per-applicant cooldown (found 2026-10-07). Signing up
// as an applicant does not prove the phone is yours, so the cooldown alone let
// anyone text a stranger's number once a minute, all day, from as many
// accounts as they liked -- and a burst of parallel requests all read "nothing
// sent yet" and all went out. Same limits as the parent sign-up code
// (app/api/auth/send-otp), plus daily caps per number/address and per
// applicant (more applicant accounts with the same number share the first).
const MAX_PER_DESTINATION_PER_HOUR = 5
const MAX_PER_DESTINATION_PER_DAY = 10
const MAX_PER_APPLICANT_PER_DAY = 10
const MAX_PER_IP_PER_HOUR = 10

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
  if (!channel) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const alreadyVerified =
    channel === 'email' ? applicant.email_verified_at : applicant.phone_verified_at
  if (alreadyVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true })
  }

  const supabase = serviceClient()

  const { data: recent } = await supabase
    .from('applicant_verifications')
    .select('last_sent_at')
    .eq('applicant_id', applicant.id)
    .eq('channel', channel)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recent) {
    const elapsed = Date.now() - new Date(recent.last_sent_at).getTime()
    const remaining = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - elapsed) / 1000)
    if (remaining > 0) {
      return NextResponse.json(
        { error: `Please wait ${remaining} seconds before requesting another code.`, retryAfter: remaining },
        { status: 429 }
      )
    }
  }

  const destination = channel === 'email' ? applicant.email : applicant.phone

  // The read above answers an honest caller with the exact wait; these
  // reservations are what hold under a burst. takeSlots reserves first and
  // counts after, so only the first through each limit go on, and a failed
  // send gives its reservations back. The destination is counted, not the
  // applicant alone, so many accounts carrying one victim's number share
  // one budget.
  const destKey = keyHash(channel, String(destination || ''))
  const slots = await takeSlots(supabase, [
    { scope: 'careers-code-cooldown', key: destKey, max: 1, windowMs: RESEND_COOLDOWN_SECONDS * 1000 },
    { scope: 'careers-code-hour', key: destKey, max: MAX_PER_DESTINATION_PER_HOUR, windowMs: 60 * 60 * 1000 },
    { scope: 'careers-code-day', key: destKey, max: MAX_PER_DESTINATION_PER_DAY, windowMs: 24 * 60 * 60 * 1000 },
    { scope: 'careers-code-applicant-day', key: applicant.id, max: MAX_PER_APPLICANT_PER_DAY, windowMs: 24 * 60 * 60 * 1000 },
    { scope: 'careers-send-code', key: ipHash(req), max: MAX_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 },
  ])
  if (slots.result === 'error') {
    return NextResponse.json({ error: 'Could not send the code. Please try again.' }, { status: 500 })
  }
  if (slots.result === 'limited') {
    if (slots.failed === 'careers-code-cooldown') {
      return NextResponse.json(
        { error: `Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`, retryAfter: RESEND_COOLDOWN_SECONDS },
        { status: 429 }
      )
    }
    const error =
      slots.failed === 'careers-code-hour'
        ? channel === 'email'
          ? 'Too many codes requested for this email address. Please try again later.'
          : 'Too many codes requested for this number. Please try again later.'
        : slots.failed === 'careers-code-day' || slots.failed === 'careers-code-applicant-day'
          ? 'Too many codes requested today. Please try again tomorrow.'
          : 'Too many codes requested from this network. Please try again later.'
    return NextResponse.json({ error }, { status: 429 })
  }

  const code = generateCode()

  const sent =
    channel === 'email'
      ? await sendEmail({
          type: 'applicant_verification_code',
          to: destination,
          applicantName: applicant.legal_first_name,
          code,
        })
        ? { ok: true as const }
        : { ok: false as const, reason: 'We could not send the email. Please check the address and try again.' }
      : await sendSms(
          destination,
          `Your Manta Shark Aquatics application code is: ${code}. It expires in ${CODE_TTL_MINUTES} minutes.` +
            SMS_COMPLIANCE_SUFFIX
        )

  if (!sent.ok) {
    for (const id of slots.ids) await releaseSlot(supabase, id)
    return NextResponse.json({ error: sent.reason }, { status: 502 })
  }

  await supabase
    .from('applicant_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('applicant_id', applicant.id)
    .eq('channel', channel)
    .is('consumed_at', null)

  const { error } = await supabase.from('applicant_verifications').insert({
    applicant_id: applicant.id,
    channel,
    code_hash: sha256(code),
    destination,
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString(),
  })

  if (error) {
    return NextResponse.json(
      { error: 'Your code was sent but could not be saved. Please request a new one.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}
