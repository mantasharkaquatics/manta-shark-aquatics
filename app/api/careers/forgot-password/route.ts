import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { normalizeEmail, sha256, generateCode, hashIp } from '@/lib/applicant-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const email = normalizeEmail(String(body.email || ''))
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 })

  const svc = serviceClient()

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

  const code = generateCode()
  const sent = await sendEmail({
    type: 'applicant_password_reset',
    to: applicant.email,
    code,
    applicantName: applicant.legal_first_name,
  })
  if (!sent) {
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
