import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function GET(req: NextRequest) {
  const studentId = req.nextUrl.searchParams.get('student_id')
  if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Step 1: 取學生
  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, current_level')
    .eq('id', studentId)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  // Step 2: 取 level 資料（用 level_number 對應）
  let levelData = null
  if (student.current_level) {
    const { data: level } = await supabase
      .from('levels')
      .select('id, level_number, name')
      .eq('level_number', student.current_level)
      .single()
    levelData = level
  }

  if (!levelData) {
    return NextResponse.json({ student: { ...student, level: null }, skills: [], progress: {} })
  }

  // Step 3: 取技能
  const { data: skills } = await supabase
    .from('skills')
    .select('id, name, sort_order')
    .eq('level_id', levelData.id)
    .order('sort_order')

  // Step 4: 取進度
  const { data: progressRows } = await supabase
    .from('student_skill_progress')
    .select('skill_id, progress')
    .eq('student_id', studentId)

  const progressMap: Record<string, number> = {}
  for (const row of progressRows || []) {
    progressMap[row.skill_id] = row.progress
  }

  return NextResponse.json({
    student: { ...student, level: levelData },
    skills: skills || [],
    progress: progressMap
  })
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { student_id, progress } = await req.json()
  if (!student_id || !progress) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

  const upserts = Object.entries(progress).map(([skill_id, pct]) => ({
    student_id,
    skill_id,
    progress: pct as number,
    updated_by_coach_id: coach.id,
    updated_at: new Date().toISOString()
  }))

  const { error } = await supabase
    .from('student_skill_progress')
    .upsert(upserts, { onConflict: 'student_id,skill_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('progress_history').insert({
    student_id,
    coach_id: coach.id,
    snapshot: progress
  })

  return NextResponse.json({ ok: true })
}
