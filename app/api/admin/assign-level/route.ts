import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { setStudentLevel, assessmentWaitingIds } from '@/lib/level-change'

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

  // Assigning the level the swimmer is already in is not a change: it used to
  // write an L3 -> L3 history row and drop the swimmer back to stage 1, a
  // click away from the page's default (found 2026-10-08). A stage moves on
  // approved lesson reports, never from here.
  if (!student_id) return NextResponse.json({ error: 'Missing student', code: 'missing_fields' }, { status: 400 })
  const { data: cur } = await supabase.from('students').select('current_level').eq('id', student_id).maybeSingle()
  if (!cur) return NextResponse.json({ error: 'Student not found', code: 'not_found' }, { status: 404 })
  if (cur.current_level != null && String(cur.current_level) === String(Number(level_number))) {
    return NextResponse.json({ error: 'The swimmer is already at this level', code: 'same_level' }, { status: 409 })
  }
  /* A swimmer with no level whose assessment report is waiting in Reviews or
     was sent back to the coach: the level has to come from confirming that
     report, or the family never gets the assessment report, its email and the
     85-point credit -- a level set here turned the coach's resubmission into
     an ordinary report and the backfill refused the swimmer (found
     2026-10-08). Every report filed for a swimmer with no level is an
     assessment (/api/coach/lesson-note). */
  if (cur.current_level == null) {
    const { ids: waiting, error: wErr } = await assessmentWaitingIds(supabase, [student_id])
    if (wErr) return NextResponse.json({ error: wErr.message || 'Could not read the swimmer\'s reports', code: 'server' }, { status: 500 })
    if (waiting.has(student_id)) {
      return NextResponse.json({ error: 'This swimmer\'s assessment report is waiting in Reviews; set the level there', code: 'assessment_waiting' }, { status: 409 })
    }
  }

  const moved = await setStudentLevel(supabase, { studentId: student_id, toLevel: level_number, adminId: admin_id, notes })
  if (!moved.ok) return NextResponse.json({ error: moved.error, code: moved.status === 400 ? 'bad_level' : moved.status === 404 ? 'not_found' : 'server' }, { status: moved.status })
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
