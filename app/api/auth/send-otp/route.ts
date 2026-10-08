import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { serviceClient } from '@/lib/api-auth'
import { sendSms, SMS_COMPLIANCE_SUFFIX } from '@/lib/sms'
import { readJson, badRequest } from '@/lib/http'
import { phoneHasAccount } from '@/lib/account-exists'
import { normalizePhone } from '@/lib/applicant-auth'
import { takeSlots, releaseSlot, ipHash, keyHash } from '@/lib/ip-rate-limit'

export const runtime = 'nodejs'

const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_PER_HOUR = 5
// Per network, on top of the per-number limit: one machine looping through
// many different numbers was never slowed by the per-number count.
const MAX_PER_IP_PER_HOUR = 10
// Account lookups per network, one budget shared with
// app/api/auth/send-email-otp (found 2026-10-08): "already registered" used
// to be answered before any limit, so the endpoint could be asked about every
// number on a list for free. Every answer counts, taken or not.
const REGISTER_LOOKUP_SCOPE = 'register-lookup'
const MAX_LOOKUPS_PER_IP_PER_HOUR = 30

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const { phone, context } = body
  if (!phone) return NextResponse.json({ error: 'Missing phone number' }, { status: 400 })

  // US numbers only, as on careers (owner, 2026-10-05). Any '+' number used to
  // pass straight to Twilio, so a script could text premium-rate numbers
  // abroad from our account (SMS pumping).
  const normalizedPhone = normalizePhone(String(phone))
  if (!normalizedPhone) {
    return NextResponse.json({ error: 'Please enter a valid US phone number.' }, { status: 400 })
  }
  const supabase = serviceClient()

  if (context === 'register') {
    const lookup = await takeSlots(supabase, [
      { scope: REGISTER_LOOKUP_SCOPE, key: ipHash(req), max: MAX_LOOKUPS_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 },
    ])
    if (lookup.result === 'error') {
      return NextResponse.json({ error: 'Failed to verify phone number. Please try again.' }, { status: 500 })
    }
    if (lookup.result === 'limited') {
      return NextResponse.json({ error: 'Too many codes requested from this network. Please try again later.', code: 'OTP_IP_HOURLY_CAP' }, { status: 429 })
    }
    // Same reasoning as the email check: a coach's number is already on file.
    const taken = await phoneHasAccount(supabase, normalizedPhone)
    if (taken === null) {
      return NextResponse.json({ error: 'Failed to verify phone number. Please try again.' }, { status: 500 })
    }
    if (taken) {
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

  // The reads above answer an honest caller quickly; these reservations are
  // what hold under a burst. Twenty requests fired at once all read "no
  // recent codes" above, and all used to be sent (found 2026-10-06).
  // takeSlots reserves first and counts after, so only the first through
  // each limit go on; a failed send gives its reservations back.
  const phoneKey = keyHash('phone', normalizedPhone)
  const slots = await takeSlots(supabase, [
    { scope: 'otp-phone-cooldown', key: phoneKey, max: 1, windowMs: RESEND_COOLDOWN_MS },
    { scope: 'otp-phone-hour', key: phoneKey, max: MAX_PER_HOUR, windowMs: 60 * 60 * 1000 },
    { scope: 'send-otp', key: ipHash(req), max: MAX_PER_IP_PER_HOUR, windowMs: 60 * 60 * 1000 },
  ])
  if (slots.result === 'error') {
    return NextResponse.json({ error: 'Failed to create verification code' }, { status: 500 })
  }
  if (slots.result === 'limited') {
    if (slots.failed === 'otp-phone-cooldown')
      return NextResponse.json({ error: 'Please wait a minute before requesting another code.' }, { status: 429 })
    if (slots.failed === 'otp-phone-hour')
      return NextResponse.json({ error: 'Too many codes requested for this number. Please try again later.' }, { status: 429 })
    return NextResponse.json({ error: 'Too many codes requested from this network. Please try again later.', code: 'OTP_IP_HOURLY_CAP' }, { status: 429 })
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
    for (const id of slots.ids) await releaseSlot(supabase, id)
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
