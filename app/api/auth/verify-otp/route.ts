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
  const { phone, otp_code } = await req.json()
  if (!phone || !otp_code) return NextResponse.json({ error: 'Missing phone or code' }, { status: 400 })

  const normalizedPhone = normalizePhone(phone)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: rows } = await supabase
    .from('phone_otps')
    .select('id, otp_code, expires_at, verified')
    .eq('phone', normalizedPhone)
    .eq('verified', false)
    .order('created_at', { ascending: false })
    .limit(1)

  const row = rows?.[0]
  if (!row) return NextResponse.json({ error: '驗證碼不存在或已使用，請重新發送' }, { status: 400 })
  if (new Date(row.expires_at) < new Date()) return NextResponse.json({ error: '驗證碼已過期，請重新發送' }, { status: 400 })
  if (row.otp_code !== otp_code) return NextResponse.json({ error: '驗證碼錯誤' }, { status: 400 })

  await supabase.from('phone_otps').update({ verified: true }).eq('id', row.id)

  return NextResponse.json({ ok: true })
}
