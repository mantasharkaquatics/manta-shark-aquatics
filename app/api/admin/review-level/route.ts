import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { recommendation_id, action, final_level, admin_id, notes } = await req.json()

  const { data: rec } = await supabase
    .from('level_recommendations')
    .select('student_id, recommended_level')
    .eq('id', recommendation_id)
    .single()

  if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const levelToAssign = action === 'modified' ? final_level : rec.recommended_level

  // 更新學生 level
  await supabase
    .from('students')
    .update({ current_level: String(levelToAssign) })
    .eq('id', rec.student_id)

  // 寫入 level_upgrades 記錄
  const { data: student } = await supabase
    .from('students')
    .select('current_level, full_name')
    .eq('id', rec.student_id)
    .single()

  await supabase.from('level_upgrades').insert({
    student_id: rec.student_id,
    from_level: null,
    to_level: String(levelToAssign),
    upgraded_by: admin_id,
    notes: notes || null,
  })

  // 更新建議狀態
  await supabase
    .from('level_recommendations')
    .update({
      status: action,
      reviewed_by: admin_id,
      final_level: levelToAssign,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', recommendation_id)

  return NextResponse.json({ ok: true })
}
