import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { getApplicant, normalizeEmail, normalizePhone } from '@/lib/applicant-auth'
import { takeSlots, ipHash } from '@/lib/ip-rate-limit'

export const runtime = 'nodejs'

/* Correct the email or phone on the verify page (found 2026-10-08). An
   applicant who mistyped their phone at sign-up -- or gave a landline -- could
   not receive the text, could not change the number, and could not register
   again with the same email: stuck for good.

   Only a field that is NOT yet verified can change, and only by the signed-in
   applicant. Changing it proves nothing by itself: the field still has to be
   verified with a code sent to the new value, and verify-code copies the
   verified destination back onto the account. Codes already sent to the old
   value are retired here so none of them can be redeemed afterwards. */
const MAX_PER_APPLICANT_PER_DAY = 5
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

  const alreadyVerified = channel === 'email' ? applicant.email_verified_at : applicant.phone_verified_at
  if (alreadyVerified) {
    return NextResponse.json(
      { error: 'This is already verified. Contact us if it needs to change.' },
      { status: 400 }
    )
  }

  let value: string
  if (channel === 'email') {
    value = normalizeEmail(String(body.value ?? ''))
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
  } else {
    const phone = normalizePhone(String(body.value ?? ''))
    if (!phone) {
      return NextResponse.json({ error: 'Please enter a valid US phone number.' }, { status: 400 })
    }
    value = phone
  }

  if (value === (channel === 'email' ? applicant.email : applicant.phone)) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  const supabase = serviceClient()

  const slots = await takeSlots(supabase, [
    { scope: 'careers-update-contact', key: applicant.id, max: MAX_PER_APPLICANT_PER_DAY, windowMs: 24 * 60 * 60 * 1000 },
    { scope: 'careers-update-contact-ip', key: ipHash(req), max: MAX_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 },
  ])
  if (slots.result === 'error') {
    return NextResponse.json({ error: 'Could not save the change. Please try again.' }, { status: 500 })
  }
  if (slots.result === 'limited') {
    return NextResponse.json(
      { error: 'Too many changes. Please try again later, or contact us for help.' },
      { status: 429 }
    )
  }

  if (channel === 'email') {
    // Same wording as registration, which already answers this question.
    const { data: taken } = await supabase
      .from('applicants')
      .select('id')
      .eq('email', value)
      .neq('id', applicant.id)
      .maybeSingle()
    if (taken) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in to that account instead.' },
        { status: 409 }
      )
    }
  }

  const { error } = await supabase
    .from('applicants')
    .update({ [channel]: value })
    .eq('id', applicant.id)
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in to that account instead.' },
        { status: 409 }
      )
    }
    console.error('careers update-contact failed', error)
    return NextResponse.json({ error: 'Could not save the change. Please try again.' }, { status: 500 })
  }

  // Retire codes sent to the old value. A password-reset code went to the old
  // email too, and must not be redeemable against the new one.
  const channels = channel === 'email' ? ['email', 'password_reset'] : ['phone']
  await supabase
    .from('applicant_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('applicant_id', applicant.id)
    .in('channel', channels)
    .is('consumed_at', null)

  return NextResponse.json({ ok: true })
}
