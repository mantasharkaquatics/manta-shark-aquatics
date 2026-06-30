import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return phone.startsWith('+') ? phone : '+' + digits
}

export async function POST(req: NextRequest) {
  const { phone } = await req.json()
  if (!phone) return NextResponse.json({ error: 'Missing phone number' }, { status: 400 })

  const normalizedPhone = normalizePhone(phone)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const otpCode = String(Math.floor(100000 + Math.random() * 900000))
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error: insertError } = await supabase.from('phone_otps').insert({
    phone: normalizedPhone,
    otp_code: otpCode,
    expires_at: expiresAt,
  })
  if (insertError) {
    return NextResponse.json({ error: 'Failed to create verification code' }, { status: 500 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const fromNumber = process.env.TWILIO_PHONE_NUMBER!

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: normalizedPhone,
          Body: `Your Manta Shark Aquatics verification code is: ${otpCode}. It expires in 10 minutes.`,
        }),
      }
    )
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}))
      console.error('Twilio send error:', errData)
      return NextResponse.json({ ok: true, warning: 'SMS delivery may be delayed (carrier registration pending)' })
    }
  } catch (e) {
    console.error('Twilio fetch error:', e)
    return NextResponse.json({ ok: true, warning: 'SMS delivery may be delayed' })
  }

  return NextResponse.json({ ok: true })
}
