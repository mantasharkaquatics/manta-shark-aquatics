import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { student_id, level_number, notes, from_level } = await req.json()
  const admin_id = auth.admin.id
  const supabase = auth.svc

  const { error: updateErr } = await supabase
    .from('students')
    .update({ current_level: level_number })
    .eq('id', student_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const { data: record, error: insertErr } = await supabase
    .from('level_upgrades')
    .insert({
      student_id,
      from_level: from_level || null,
      to_level: level_number,
      upgraded_by: admin_id,
      notes: notes || null,
    })
    .select('id, from_level, to_level, upgraded_at, notes, students(full_name), admins(first_name, last_name)')
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const normalized = {
    ...record,
    students: Array.isArray((record as any).students) ? (record as any).students[0] : (record as any).students,
    admins: Array.isArray((record as any).admins) ? (record as any).admins[0] : (record as any).admins,
  }

  return NextResponse.json(normalized)
}
