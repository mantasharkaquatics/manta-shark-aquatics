import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { readJson, badRequest } from '@/lib/http'

export const runtime = 'nodejs'

/* Attempt cap (found 2026-10-05: there was none, so a 6-digit code could be
   brute-forced inside its ten minutes).

   The phone route counts attempts with the bump_otp_attempt RPC on
   phone_otps; email_otps has no attempts column, and this change adds no
   schema. So the count is kept in expires_at itself: every guess pulls the
   expiry in by TTL / MAX_ATTEMPTS (2 minutes), BEFORE the code is compared.
   Five guesses use up the whole ten minutes, so a code can never be tried
   more than five times, and fewer the longer the family waits.

   The pull-in is a compare-and-swap (update ... where expires_at = the value
   we read). Two guesses racing on the same row cannot both pass: the second
   finds expires_at already moved and is refused, so parallel requests cannot
   buy extra attempts. CODE_TTL_MS must match app/api/auth/send-email-otp. */
const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const ATTEMPT_COST_MS = CODE_TTL_MS / MAX_ATTEMPTS

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const { email, otp_code } = body
  if (!email || !otp_code) return NextResponse.json({ error: 'Missing email or code' }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: rows, error: lookupError } = await supabase
    .from('email_otps')
    .select('id, otp_code, expires_at, created_at')
    .eq('email', normalizedEmail)
    .eq('verified', false)
    .order('created_at', { ascending: false })
    .limit(1)
  if (lookupError) return NextResponse.json({ error: 'Could not check the code. Please try again.' }, { status: 500 })

  const row = rows?.[0]
  if (!row) return NextResponse.json({ error: 'Verification code not found or already used. Please request a new one.' }, { status: 400 })

  const expiresMs = new Date(row.expires_at).getTime()
  // Guesses already spent, read back from how far the expiry has moved in.
  // Rounded, so the second or two between computing expires_at in the send
  // route and the row's created_at default does not count as an attempt.
  const spent = Math.round((new Date(row.created_at).getTime() + CODE_TTL_MS - expiresMs) / ATTEMPT_COST_MS)
  if (spent >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many incorrect attempts. Please request a new code.' }, { status: 400 })
  }
  if (expiresMs < Date.now()) return NextResponse.json({ error: 'Verification code expired. Please request a new one.' }, { status: 400 })

  const { data: claimed, error: bumpError } = await supabase
    .from('email_otps')
    .update({ expires_at: new Date(expiresMs - ATTEMPT_COST_MS).toISOString() })
    .eq('id', row.id)
    .eq('verified', false)
    .eq('expires_at', row.expires_at)
    .select('id')
  if (bumpError || !claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'Could not check the code. Please try again.' }, { status: 409 })
  }

  if (row.otp_code !== String(otp_code)) return NextResponse.json({ error: 'Incorrect verification code' }, { status: 400 })

  const { error: markError } = await supabase.from('email_otps').update({ verified: true }).eq('id', row.id)
  if (markError) return NextResponse.json({ error: 'Could not confirm the code. Please try again.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
