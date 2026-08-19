import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { normalizeEmail, sha256, hashPassword, passwordProblem } from '@/lib/applicant-auth'

export const runtime = 'nodejs'

const MAX_ATTEMPTS = 5

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

  const { data: applicant } = await svc
    .from('applicants')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (!applicant) {
    return NextResponse.json({ error: 'That code is not valid.' }, { status: 400 })
  }

  const { data: record } = await svc
    .from('applicant_verifications')
    .select('id, code_hash, expires_at, consumed_at, attempt_count')
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

  if (record.code_hash !== sha256(code)) {
    await svc
      .from('applicant_verifications')
      .update({ attempt_count: (record.attempt_count || 0) + 1 })
      .eq('id', record.id)
    return NextResponse.json({ error: 'That code is not valid.' }, { status: 400 })
  }

  const now = new Date().toISOString()

  await svc
    .from('applicants')
    .update({
      password_hash: await hashPassword(password),
      failed_login_count: 0,
      locked_until: null,
    })
    .eq('id', applicant.id)

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
