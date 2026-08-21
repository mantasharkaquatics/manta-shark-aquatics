import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = auth.svc
  const body = await readJson(req)
  if (!body) return badRequest()
  const { recommendation_id, action, final_level, notes } = body
  const admin_id = auth.admin.id

  const { data: rec } = await supabase
    .from('level_recommendations')
    .select('student_id, recommended_level')
    .eq('id', recommendation_id)
    .single()

  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const levelToAssign = action === 'modified' ? final_level : rec.recommended_level

  // A rejection is the admin's veto. The student's level and the upgrade
  // history must not move -- only the recommendation's own status changes.
  // This route used to run both writes unconditionally, so Reject promoted
  // the student exactly like Approve.
  if (action !== 'rejected') {
    // Read the level BEFORE the update, or from_level records the new value.
    const { data: student, error: readErr } = await supabase
      .from('students')
      .select('current_level')
      .eq('id', rec.student_id)
      .single()

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })

    const { error: updateErr } = await supabase
      .from('students')
      .update({ current_level: String(levelToAssign) })
      .eq('id', rec.student_id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    const { error: insertErr } = await supabase.from('level_upgrades').insert({
      student_id: rec.student_id,
      from_level: student?.current_level ?? null,
      to_level: String(levelToAssign),
      upgraded_by: admin_id,
      notes: notes || null,
    })

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  const { error: statusErr } = await supabase
    .from('level_recommendations')
    .update({
      status: action,
      reviewed_by: admin_id,
      final_level: levelToAssign,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', recommendation_id)

  if (statusErr) return NextResponse.json({ error: statusErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
