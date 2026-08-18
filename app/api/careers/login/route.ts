import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import {
  normalizeEmail,
  verifyPassword,
  hashPassword,
  createSession,
} from '@/lib/applicant-auth'

export const runtime = 'nodejs'

const MAX_FAILED = 8
const LOCK_MINUTES = 15
const GENERIC = 'Email or password is incorrect.'

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
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.` },
      { status: 429 }
    )
  }

  const valid = await verifyPassword(password, applicant.password_hash)

  if (!valid) {
    const failed = applicant.failed_login_count + 1
    await supabase
      .from('applicants')
      .update({
        failed_login_count: failed,
        locked_until:
          failed >= MAX_FAILED
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
            : null,
      })
      .eq('id', applicant.id)
    return NextResponse.json({ error: GENERIC }, { status: 401 })
  }

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
