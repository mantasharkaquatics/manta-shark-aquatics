import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { student_id, level_number, notes, from_level } = body
  const admin_id = auth.admin.id
  const supabase = auth.svc

  const { error: updateErr } = await supabase
    .from('students')
    .update({ current_level: level_number, current_stage: 1 })
    .eq('id', student_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const { data: record, error: insertErr } = await supabase
    .from('level_upgrades')
    .insert({
      student_id,
      from_level: from_level || null,
      to_level: level_number,
      to_stage: 1,
      upgraded_by: admin_id,
      notes: notes || null,
    })
    .select('id, from_level, to_level, upgraded_at, notes')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

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
