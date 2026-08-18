import { NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import {
  normalizeEmail,
  normalizePhone,
  passwordProblem,
  hashPassword,
  createSession,
  hashIp,
} from '@/lib/applicant-auth'

export const runtime = 'nodejs'

const MAX_PER_IP_PER_HOUR = 3
const MIN_FORM_SECONDS = 3

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

  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true })
  }

  const loadedAt = Number(body.formLoadedAt)
  if (Number.isFinite(loadedAt) && Date.now() - loadedAt < MIN_FORM_SECONDS * 1000) {
    return NextResponse.json(
      { error: 'Please review your details and try again.' },
      { status: 400 }
    )
  }

  const firstName = String(body.firstName ?? '').trim()
  const lastName = String(body.lastName ?? '').trim()
  const email = normalizeEmail(String(body.email ?? ''))
  const phone = normalizePhone(String(body.phone ?? ''))
  const password = String(body.password ?? '')

  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: 'Please enter your legal first and last name.' },
      { status: 400 }
    )
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }
  if (!phone) {
    return NextResponse.json({ error: 'Please enter a valid US phone number.' }, { status: 400 })
  }
  const pwProblem = passwordProblem(password)
  if (pwProblem) {
    return NextResponse.json({ error: pwProblem }, { status: 400 })
  }

  const supabase = serviceClient()
  const ip = clientIp(req)
  const ipHash = hashIp(ip)
  const userAgent = req.headers.get('user-agent')

  if (ipHash) {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('applicants')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('created_at', since)
    if ((count ?? 0) >= MAX_PER_IP_PER_HOUR) {
      return NextResponse.json(
        { error: 'Too many accounts created from this network. Please try again later.' },
        { status: 429 }
      )
    }
  }

  const { data: existing } = await supabase
    .from('applicants')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists. Please sign in instead.' },
      { status: 409 }
    )
  }

  const { data: created, error } = await supabase
    .from('applicants')
    .insert({
      legal_first_name: firstName,
      legal_last_name: lastName,
      email,
      phone,
      password_hash: await hashPassword(password),
      ip_hash: ipHash,
      user_agent: userAgent,
    })
    .select('id')
    .single()

  if (error || !created) {
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Could not create your account. Please try again.' },
      { status: 500 }
    )
  }

  await createSession(created.id, { ip, userAgent })

  return NextResponse.json({ ok: true })
}
