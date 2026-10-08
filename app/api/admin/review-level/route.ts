import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { setStudentLevel } from '@/lib/level-change'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = auth.svc
  const body = await readJson(req)
  if (!body) return badRequest()
  const { recommendation_id, action, final_level, notes } = body
  const admin_id = auth.admin.id
  if (!['approved', 'modified', 'rejected'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }

  const { data: rec } = await supabase
    .from('level_recommendations')
    .select('student_id, recommended_level, status')
    .eq('id', recommendation_id)
    .single()

  if (!rec) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
  // Two admins, or one double click: the second answer must not move the
  // swimmer again or write a second history row.
  if (rec.status !== 'pending') {
    return NextResponse.json({ error: 'This recommendation has already been answered', code: 'already_answered' }, { status: 409 })
  }

  const levelToAssign = action === 'modified' ? final_level : rec.recommended_level

  // Claim the recommendation BEFORE moving the swimmer. The status check above
  // is a read, so two answers arriving together both passed it and both moved
  // the level (found 2026-10-04). Only the call that flips pending wins.
  const { data: claimed, error: claimErr } = await supabase
    .from('level_recommendations')
    .update({
      status: action,
      reviewed_by: admin_id,
      final_level: action === 'rejected' ? null : Number(levelToAssign),
      reviewed_at: new Date().toISOString()
    })
    .eq('id', recommendation_id)
    .eq('status', 'pending')
    .select('id')
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'This recommendation has already been answered', code: 'already_answered' }, { status: 409 })
  }

  // A rejection is the admin's veto. The student's level and the upgrade
  // history must not move -- only the recommendation's own status changes.
  if (action !== 'rejected') {
    // Already there (a confirm that stopped part-way, or a level set by hand
    // meanwhile): close the recommendation without a second history row, and
    // without sending the swimmer back to stage 1.
    const { data: cur } = await supabase
      .from('students').select('current_level').eq('id', rec.student_id).single()
    if (String(cur?.current_level ?? '') !== String(Number(levelToAssign))) {
      const moved = await setStudentLevel(supabase, {
        studentId: rec.student_id, toLevel: levelToAssign, adminId: admin_id, notes,
      })
      if (!moved.ok) {
        // Release the claim so the admin can try again.
        await supabase.from('level_recommendations')
          .update({ status: 'pending', reviewed_by: null, final_level: null, reviewed_at: null })
          .eq('id', recommendation_id).eq('status', action)
        return NextResponse.json({ error: moved.error }, { status: moved.status })
      }
    }
  }

  return NextResponse.json({ ok: true })
}
