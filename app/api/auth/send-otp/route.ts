import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { serviceClient } from '@/lib/api-auth'
import { sendSms, SMS_COMPLIANCE_SUFFIX } from '@/lib/sms'

export const runtime = 'nodejs'

const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_PER_HOUR = 5

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return phone.startsWith('+') ? phone : '+' + digits
}

export async function POST(req: NextRequest) {
  const { phone, context } = await req.json()
  if (!phone) return NextResponse.json({ error: 'Missing phone number' }, { status: 400 })

  const normalizedPhone = normalizePhone(phone)
  const supabase = serviceClient()

  if (context === 'register') {
    const last10 = normalizedPhone.replace(/\D/g, '').slice(-10)
    const { data: existing, error: lookupError } = await supabase
      .from('parents')
      .select('id')
      .like('phone', `%${last10}`)
      .limit(1)
    if (lookupError) {
      return NextResponse.json({ error: 'Failed to verify phone number. Please try again.' }, { status: 500 })
    }
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'This phone number is already registered. Please log in instead.' }, { status: 409 })
    }
  }

  // Throttle server-side. The register page has a 60s cooldown of its own, but
  // that only slows the browser down, and every text costs money -- the limit
  // has to live here, where a direct POST cannot step around it.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { data: recent, error: recentError } = await supabase
    .from('phone_otps')
    .select('created_at')
    .eq('phone', normalizedPhone)
    .gte('created_at', hourAgo)
    .order('created_at', { ascending: false })

  if (recentError) {
    return NextResponse.json({ error: 'Failed to create verification code' }, { status: 500 })
  }
  if (recent && recent.length >= MAX_PER_HOUR) {
    return NextResponse.json({ error: 'Too many codes requested for this number. Please try again later.' }, { status: 429 })
  }
  if (recent && recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < RESEND_COOLDOWN_MS) {
    return NextResponse.json({ error: 'Please wait a minute before requesting another code.' }, { status: 429 })
  }

  // randomInt, not Math.random: this code is a login boundary and V8's PRNG is
  // predictable from enough observed output.
  const otpCode = String(randomInt(100000, 1000000))

  // Send BEFORE writing the row. The reverse leaves a row for a code that was
  // never delivered, and the cooldown above would then run from that row --
  // locking the caller out behind a text they are never going to receive.
  const sent = await sendSms(
    normalizedPhone,
    `Your Manta Shark Aquatics verification code is: ${otpCode}. It expires in 10 minutes.${SMS_COMPLIANCE_SUFFIX}`
  )
  if (!sent.ok) {
    return NextResponse.json({ error: sent.reason }, { status: 502 })
  }

  const { error: insertError } = await supabase.from('phone_otps').insert({
    phone: normalizedPhone,
    otp_code: otpCode,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  })
  if (insertError) {
    return NextResponse.json({ error: 'Failed to create verification code' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
