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

  // Whose code, before checking in: a swimmer the desk's list did not load
  // gets the same name-and-parent confirm (14-role test 2, J88). Writes nothing.
  if (body.preview === true) {
    const { data: st } = await auth.svc.from('students')
      .select('id, full_name, is_active, parents(first_name, last_name)').eq('id', student_id).maybeSingle()
    if (!st) return NextResponse.json({ error: 'Student not found', code: 'not_found' }, { status: 404 })
    return NextResponse.json({ student: st })
  }

  const r = await checkInStudent(auth.svc, student_id, check_in_method === 'qr_code' ? 'qr' : 'manual')
  // The code too (found 2026-10-15): the desk screen words it in the admin's
  // language; `error` is English.
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code, lesson_time: r.lesson_time }, { status: r.status })

  const { ok: _ok, ...rest } = r
  return NextResponse.json({ success: true, ...rest })
}
