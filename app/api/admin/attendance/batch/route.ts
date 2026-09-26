import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { checkInStudent } from '@/lib/checkin'

// The front desk: a scanned QR code or a ticked name. The rule itself -- the
// window, back-to-back lessons, Swim Team practices -- lives in lib/checkin.ts,
// shared with the parent's "I'm here" button.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (!body) return badRequest()
  const { student_id, check_in_method } = body
  if (!student_id) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  const r = await checkInStudent(auth.svc, student_id, check_in_method === 'qr_code' ? 'qr' : 'manual')
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })

  const { ok: _ok, ...rest } = r
  return NextResponse.json({ success: true, ...rest })
}
