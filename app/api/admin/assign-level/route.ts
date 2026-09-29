import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { setStudentLevel } from '@/lib/level-change'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  // from_level is read from the database inside setStudentLevel, not taken
  // from the request: the page sends what it last saw, which can be stale.
  const { student_id, level_number, notes } = body
  const admin_id = auth.admin.id
  const supabase = auth.svc

  const moved = await setStudentLevel(supabase, { studentId: student_id, toLevel: level_number, adminId: admin_id, notes })
  if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status })
  const record = moved.record

  // Two-step instead of a nested join: there is no FK from level_upgrades to
  // admins for PostgREST to embed, and nested joins fail silently in production.
  const [{ data: stu }, { data: adm }] = await Promise.all([
    supabase.from('students').select('full_name').eq('id', student_id).single(),
    supabase.from('admins').select('first_name, last_name').eq('id', admin_id).single(),
  ])

  const normalized = {
    ...record,
    students: stu || null,
    admins: adm || null,
  }

  return NextResponse.json(normalized)
}
