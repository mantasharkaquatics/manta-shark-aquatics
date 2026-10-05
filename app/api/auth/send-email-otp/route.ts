import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { readJson, badRequest } from '@/lib/http'
import { emailHasAccount } from '@/lib/account-exists'

export const runtime = 'nodejs'

const resend = new Resend(process.env.RESEND_API_KEY)

// Same limits as the phone route (app/api/auth/send-otp), found missing here
// 2026-10-05: with no throttle, a script could mail any address over and
// over from our domain, and refresh codes as fast as it could guess them.
const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_PER_HOUR = 5

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const { email, context } = body
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (context === 'register') {
    // Coaches and admins have logins too. Catching them here means the refusal
    // lands on the email field, not on the final submit.
    const taken = await emailHasAccount(supabase, normalizedEmail)
    if (taken === null) {
      return NextResponse.json({ error: 'Failed to verify email. Please try again.' }, { status: 500 })
    }
    if (taken) {
      return NextResponse.json({ error: 'This email is already registered. Please log in instead.' }, { status: 409 })
    }
  }

  // Throttle server-side, on the email_otps rows themselves (no new table).
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: recent, error: recentError } = await supabase
    .from('email_otps')
    .select('created_at')
    .eq('email', normalizedEmail)
    .gte('created_at', hourAgo)
    .order('created_at', { ascending: false })
  if (recentError) {
    return NextResponse.json({ error: 'Failed to create verification code' }, { status: 500 })
  }
  if (recent && recent.length >= MAX_PER_HOUR) {
    // `code` lets the register page show its own translated sentence; the
    // phone route's wording says "number", which is wrong here.
    return NextResponse.json({ error: 'Too many codes requested for this email. Please try again later.', code: 'EMAIL_OTP_HOURLY_CAP' }, { status: 429 })
  }
  if (recent && recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < RESEND_COOLDOWN_MS) {
    return NextResponse.json({ error: 'Please wait a minute before requesting another code.' }, { status: 429 })
  }

  // randomInt, not Math.random: this code is a login boundary and V8's PRNG is
  // predictable from enough observed output.
  const otpCode = String(randomInt(100000, 1000000))

  // Send BEFORE writing the row, as the phone route does: a row for a code
  // that never arrived would start the cooldown above and lock the family out
  // behind an email they will never receive.
  try {
    // Resend reports an API failure in its result rather than by throwing;
    // with the row now written after the send, that has to be checked.
    const { error: sendError } = await resend.emails.send({
      from: 'Manta Shark Aquatics <info@mantasharkaquatics.net>',
      to: normalizedEmail,
      subject: `Your verification code: ${otpCode}`,
      html: `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 22px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; text-align: center;"><p style="color: #666; margin-bottom: 16px;">Your email verification code is:</p><div style="font-size: 32px; font-weight: 700; letter-spacing: 0.3em; color: #1a2744; margin-bottom: 16px;">${otpCode}</div><p style="color: #999; font-size: 13px;">This code expires in 10 minutes.</p></div></div>`,
    })
    if (sendError) throw sendError
  } catch (e) {
    console.error('Resend send error:', e)
    return NextResponse.json({ error: 'Failed to send email. Please try again later.' }, { status: 500 })
  }

  const { error: insertError } = await supabase.from('email_otps').insert({
    email: normalizedEmail,
    otp_code: otpCode,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  })
  if (insertError) {
    return NextResponse.json({ error: 'Failed to create verification code' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
