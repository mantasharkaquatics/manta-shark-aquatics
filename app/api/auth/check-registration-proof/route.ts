import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { takeSlots, ipHash } from '@/lib/ip-rate-limit'
import {
  findProof, normalizePhone, PROOF_WINDOW_MS, EMAIL_NOT_VERIFIED, PHONE_NOT_VERIFIED,
} from '@/lib/registration-proof'

export const runtime = 'nodejs'

/* Asked by the register page just before it creates the login (found
   2026-10-08).

   The browser makes the login (supabase.auth.signUp) and only then does
   /api/auth/complete-registration check the email and phone codes. A family
   who verified both, then spent over an hour finding birthdays, got a login
   and a "verify again" -- and if they closed the page there, a login with no
   family row: forgot-password sent nothing and registering again said the
   email already had an account. Checking first sends them back to step 1
   BEFORE any login exists.

   Read-only: nothing is spent here; complete-registration still checks and
   claims the codes itself. The window is a little shorter than the real one
   so a code that passes here cannot expire in the second between this answer
   and complete-registration. Any failure on our side answers "ok": the real
   check follows, and this must never block a sign-up on its own. */

const MARGIN_MS = 2 * 60 * 1000
const MAX_PER_IP_PER_HOUR = 30

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const email = String(body.email || '').trim().toLowerCase()
  const phone = normalizePhone(String(body.phone || '').trim())
  if (!email || phone.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })

  const svc = serviceClient()
  const slots = await takeSlots(svc, [
    { scope: 'check-registration-proof', key: ipHash(req), max: MAX_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 },
  ])
  if (slots.result !== 'ok') return NextResponse.json({ ok: true })

  const windowMs = PROOF_WINDOW_MS - MARGIN_MS
  const emailProof = await findProof(svc, 'email_otps', 'email', email, windowMs)
  if (!('error' in emailProof) && !emailProof.id) return NextResponse.json(EMAIL_NOT_VERIFIED, { status: 400 })
  const phoneProof = await findProof(svc, 'phone_otps', 'phone', phone, windowMs)
  if (!('error' in phoneProof) && !phoneProof.id) return NextResponse.json(PHONE_NOT_VERIFIED, { status: 400 })
  return NextResponse.json({ ok: true })
}
