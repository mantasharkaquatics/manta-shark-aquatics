import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const auth = await requireStaff()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await req.json().catch(() => null)
  if (!payload?.type || !payload?.to) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  const ok = await sendEmail(payload)
  if (!ok) return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  return NextResponse.json({ success: true })
}
