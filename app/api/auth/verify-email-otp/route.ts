import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { email, otp_code } = await req.json()
  if (!email || !otp_code) return NextResponse.json({ error: 'Missing email or code' }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: rows } = await supabase
    .from('email_otps')
    .select('id, otp_code, expires_at, verified')
    .eq('email', normalizedEmail)
    .eq('verified', false)
    .order('created_at', { ascending: false })
    .limit(1)

  const row = rows?.[0]
  if (!row) return NextResponse.json({ error: 'Verification code not found or already used. Please request a new one.' }, { status: 400 })
  if (new Date(row.expires_at) < new Date()) return NextResponse.json({ error: 'Verification code expired. Please request a new one.' }, { status: 400 })
  if (row.otp_code !== otp_code) return NextResponse.json({ error: 'Incorrect verification code' }, { status: 400 })

  await supabase.from('email_otps').update({ verified: true }).eq('id', row.id)

  return NextResponse.json({ ok: true })
}
