import { NextRequest, NextResponse } from 'next/server'
import { serviceClient } from '@/lib/api-auth'

export const runtime = 'nodejs'

const MAX_ATTEMPTS = 5

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return phone.startsWith('+') ? phone : '+' + digits
}

export async function POST(req: NextRequest) {
  const { phone, otp_code } = await req.json()
  if (!phone || !otp_code) return NextResponse.json({ error: 'Missing phone or code' }, { status: 400 })

  const normalizedPhone = normalizePhone(phone)
  const supabase = serviceClient()

  const { data: rows, error: lookupError } = await supabase
    .from('phone_otps')
    .select('id, otp_code, expires_at')
    .eq('phone', normalizedPhone)
    .eq('verified', false)
    .order('created_at', { ascending: false })
    .limit(1)

  if (lookupError) return NextResponse.json({ error: 'Could not check the code. Please try again.' }, { status: 500 })

  const row = rows?.[0]
  if (!row) return NextResponse.json({ error: 'Verification code not found or already used. Please request a new one.' }, { status: 400 })
  if (new Date(row.expires_at) < new Date()) return NextResponse.json({ error: 'Verification code expired. Please request a new one.' }, { status: 400 })

  // Count the attempt in Postgres and BEFORE comparing. A 6-digit code is a
  // million guesses against a row that lives for ten minutes, so an unbounded
  // compare is a brute-force target -- and a read-modify-write counter would
  // let concurrent guesses all read the same value and defeat the lockout.
  const { data: attempts, error: bumpError } = await supabase.rpc('bump_otp_attempt', { p_id: row.id })
  if (bumpError) return NextResponse.json({ error: 'Could not check the code. Please try again.' }, { status: 500 })
  if (typeof attempts === 'number' && attempts > MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'Too many incorrect attempts. Please request a new code.' }, { status: 400 })
  }

  if (row.otp_code !== otp_code) return NextResponse.json({ error: 'Incorrect verification code' }, { status: 400 })

  const { error: markError } = await supabase.from('phone_otps').update({ verified: true }).eq('id', row.id)
  if (markError) return NextResponse.json({ error: 'Could not confirm the code. Please try again.' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
