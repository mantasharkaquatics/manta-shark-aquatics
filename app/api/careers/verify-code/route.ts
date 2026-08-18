import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { getApplicant, sha256 } from '@/lib/applicant-auth'

export const runtime = 'nodejs'

const MAX_ATTEMPTS = 5

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

  if (record.code_hash !== sha256(code)) {
    const attempts = record.attempt_count + 1
    await supabase
      .from('applicant_verifications')
      .update({ attempt_count: attempts })
      .eq('id', record.id)

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
