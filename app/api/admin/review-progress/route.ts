import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { history_id, student_id, updated_snapshot } = await req.json()
  const admin_id = auth.admin.id
  const supabase = auth.svc

  // 如果主管在確認前有手動更改百分比，先同步寫入學生實際技能進度表
  if (updated_snapshot && student_id) {
    const upserts = Object.entries(updated_snapshot).map(([skill_id, pct]) => ({
      student_id,
      skill_id,
      progress_percent: pct as number,
      last_updated_by: admin_id,
      last_updated_at: new Date().toISOString()
    }))
    const { error: upsertError } = await supabase
      .from('student_skill_progress')
      .upsert(upserts, { onConflict: 'student_id,skill_id' })
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  const updatePayload: any = {
    status: 'approved',
    reviewed_by: admin_id,
    reviewed_at: new Date().toISOString()
  }
  if (updated_snapshot) updatePayload.snapshot = updated_snapshot

  const { error } = await supabase
    .from('progress_history')
    .update(updatePayload)
    .eq('id', history_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
