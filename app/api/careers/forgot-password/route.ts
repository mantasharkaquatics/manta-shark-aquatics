import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { normalizeEmail, sha256, generateCode, hashIp } from '@/lib/applicant-auth'
import { takeSlot, takeSlots, releaseSlot, ipHash, keyHash } from '@/lib/ip-rate-limit'

export const runtime = 'nodejs'

// Reserve-first fences (found 2026-10-07). The 60-second gap below is read
// before the email is sent and written after, so a burst all passed it; and
// every new code here is five more guesses at /api/careers/reset-password.
const MAX_PER_EMAIL_PER_HOUR = 5
const MAX_PER_IP_PER_HOUR = 10

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const email = normalizeEmail(String(body.email || ''))
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

  const svc = serviceClient()

  // Per network first, so a sweep through a list of addresses is counted
  // whether or not they have accounts.
  const ipSlot = await takeSlot(svc, 'careers-forgot-password', ipHash(req), MAX_PER_IP_PER_HOUR, 60 * 60 * 1000)
  if (ipSlot.result === 'error') {
    return NextResponse.json({ error: 'Could not send the email. Please try again.' }, { status: 500 })
  }
  if (ipSlot.result === 'limited') {
    return NextResponse.json({ error: 'Too many requests from this network. Please try again later.' }, { status: 429 })
  }

  const { data: applicant } = await svc
    .from('applicants')
    .select('id, email, email_verified_at, legal_first_name')
    .eq('email', email)
    .maybeSingle()

  // Always report success: revealing whether an account exists is an enumeration leak.
  if (!applicant || !applicant.email_verified_at) {
    return NextResponse.json({ ok: true })
  }

  const { data: recent } = await svc
    .from('applicant_verifications')
    .select('last_sent_at')
    .eq('applicant_id', applicant.id)
    .eq('channel', 'password_reset')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (recent?.last_sent_at) {
    const elapsed = Date.now() - new Date(recent.last_sent_at).getTime()
    if (elapsed < 60_000) {
      return NextResponse.json({ error: 'Please wait a moment before requesting another code.' }, { status: 429 })
    }
  }

  const emailKey = keyHash('email', applicant.email)
  const slots = await takeSlots(svc, [
    { scope: 'careers-reset-cooldown', key: emailKey, max: 1, windowMs: 60_000 },
    { scope: 'careers-reset-hour', key: emailKey, max: MAX_PER_EMAIL_PER_HOUR, windowMs: 60 * 60 * 1000 },
  ])
  if (slots.result === 'error') {
    await releaseSlot(svc, ipSlot.id)
    return NextResponse.json({ error: 'Could not send the email. Please try again.' }, { status: 500 })
  }
  if (slots.result === 'limited') {
    return NextResponse.json({ error: 'Please wait a moment before requesting another code.' }, { status: 429 })
  }

  const code = generateCode()
  const sent = await sendEmail({
    type: 'applicant_password_reset',
    to: applicant.email,
    code,
    applicantName: applicant.legal_first_name,
  })
  if (!sent) {
    for (const id of [...slots.ids, ipSlot.id]) await releaseSlot(svc, id)
    return NextResponse.json({ error: 'Could not send the email. Please try again.' }, { status: 502 })
  }

  const now = new Date()
  const { error: insertError } = await svc.from('applicant_verifications').insert({
    applicant_id: applicant.id,
    channel: 'password_reset',
    code_hash: sha256(code),
    destination: applicant.email,
    expires_at: new Date(now.getTime() + 10 * 60_000).toISOString(),
    last_sent_at: now.toISOString(),
    ip_hash: hashIp(req.headers.get('x-forwarded-for') || ''),
    user_agent: (req.headers.get('user-agent') || '').slice(0, 500),
  })

  if (insertError) {
    console.error('password reset code insert failed', insertError)
    return NextResponse.json({ error: 'Could not start the reset. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
