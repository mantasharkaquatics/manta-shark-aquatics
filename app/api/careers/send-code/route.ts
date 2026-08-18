import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { sendSms, SMS_COMPLIANCE_SUFFIX } from '@/lib/sms'
import { getApplicant, generateCode, sha256 } from '@/lib/applicant-auth'

export const runtime = 'nodejs'

const CODE_TTL_MINUTES = 10
const RESEND_COOLDOWN_SECONDS = 60

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
