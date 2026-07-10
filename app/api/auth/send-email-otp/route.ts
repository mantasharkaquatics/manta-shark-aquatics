import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

export const runtime = 'nodejs'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { email, context } = await req.json()
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (context === 'register') {
    const { data: existing, error: lookupError } = await supabase
      .from('parents')
      .select('id')
      .ilike('email', normalizedEmail)
      .limit(1)
    if (lookupError) {
      return NextResponse.json({ error: 'Failed to verify email. Please try again.' }, { status: 500 })
    }
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'This email is already registered. Please log in instead.' }, { status: 409 })
    }
  }

  const otpCode = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error: insertError } = await supabase.from('email_otps').insert({
    email: normalizedEmail,
    otp_code: otpCode,
    expires_at: expiresAt,
  })
  if (insertError) {
    return NextResponse.json({ error: 'Failed to create verification code' }, { status: 500 })
  }

  try {
    await resend.emails.send({
      from: 'Manta Shark Aquatics <info@mantasharkaquatics.net>',
      to: normalizedEmail,
      subject: `Your verification code: ${otpCode}`,
      html: `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; background: #f9f9f9; padding: 32px; border-radius: 12px;"><div style="text-align: center; margin-bottom: 24px;"><h1 style="color: #1a2744; font-size: 22px; margin: 0;">Manta Shark Aquatics</h1></div><div style="background: white; border-radius: 8px; padding: 24px; text-align: center;"><p style="color: #666; margin-bottom: 16px;">Your email verification code is:</p><div style="font-size: 32px; font-weight: 700; letter-spacing: 0.3em; color: #1a2744; margin-bottom: 16px;">${otpCode}</div><p style="color: #999; font-size: 13px;">This code expires in 10 minutes.</p></div></div>`,
    })
  } catch (e) {
    console.error('Resend send error:', e)
    return NextResponse.json({ error: 'Failed to send email. Please try again later.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
