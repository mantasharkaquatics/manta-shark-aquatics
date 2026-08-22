import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireStaff } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

export async function GET(req: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const studentId = req.nextUrl.searchParams.get('student_id')
  const classSessionId = req.nextUrl.searchParams.get('class_session_id')
  if (!studentId) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, current_level, current_stage')
    .eq('id', studentId)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

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
    return NextResponse.json({ student: { ...student, level: null }, skills: [], progress: {}, todayLocked: false })
  }

  const { data: skills } = await supabase
    .from('skills')
    .select('id, name, sort_order, stage')
    .eq('level_id', levelData.id)
    .order('stage')
    .order('sort_order')

  const { data: progressRows } = await supabase
    .from('student_skill_progress')
    .select('skill_id, progress_percent')
    .eq('student_id', studentId)

  const progressMap: Record<string, number> = {}
  for (const row of progressRows || []) {
    progressMap[row.skill_id] = row.progress_percent
  }

  // Check whether this lesson is already saved (keyed by class_session_id so same-day lessons don't lock each other)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  let todayLocked = false
  if (classSessionId) {
    const { data: todayHistoryRows } = await supabase
      .from('progress_history')
      .select('id')
      .eq('student_id', studentId)
      .eq('class_session_id', classSessionId)
      .limit(1)
    todayLocked = !!(todayHistoryRows && todayHistoryRows.length > 0)
  } else {
    const { data: todayHistoryRows } = await supabase
      .from('progress_history')
      .select('id')
      .eq('student_id', studentId)
      .eq('session_date', today)
      .limit(1)
    todayLocked = !!(todayHistoryRows && todayHistoryRows.length > 0)
  }

  // The coach's preset note language, so the recorder opens on the right one
  // without the page needing to thread it down from the layout.
  const { data: me } = await supabase
    .from('coaches').select('default_note_language')
    .eq('auth_user_id', staff.user.id).maybeSingle()

  return NextResponse.json({
    student: { ...student, level: levelData },
    skills: skills || [],
    progress: progressMap,
    todayLocked,
    coachDefaultLanguage: me?.default_note_language || 'en'
  })
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { student_id, progress, session_date, class_session_id, coach_id: bodyCoachId } = body
  let coach_id: string | null = null
  if (staff.role === 'coach') {
    const { data: self } = await supabase.from('coaches').select('id').eq('auth_user_id', staff.user.id).single()
    if (!self) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    coach_id = self.id
  } else {
    coach_id = bodyCoachId || null
  }
  if (!student_id || !progress) return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  if (!coach_id) return NextResponse.json({ error: 'This session has no assigned coach' }, { status: 400 })

  // Verify coach exists
  const { data: coach } = await supabase
    .from('coaches')
    .select('id')
    .eq('id', coach_id)
    .single()

  if (!coach) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const today = session_date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  // A stage the swimmer has not reached yet may not be written. The recorder
  // already greys those out; this stops a tab left open across a promotion, and
  // stops a stage being marked out of order so the trigger promotes on work the
  // swimmer never did. Stages already passed stay writable so a mistake can be
  // corrected.
  const { data: gateStudent } = await supabase
    .from('students').select('current_level, current_stage').eq('id', student_id).single()

  let allowed: Set<string> | null = null
  let stored: Record<string, number> = {}
  if (gateStudent?.current_level) {
    const { data: lvl } = await supabase
      .from('levels').select('id').eq('level_number', gateStudent.current_level).maybeSingle()
    if (lvl) {
      const { data: levelSkills } = await supabase
        .from('skills').select('id, stage').eq('level_id', lvl.id).eq('is_active', true)
      const stage = Number(gateStudent.current_stage) || 1
      // Stages up to and including the current one; a future stage is refused.
      allowed = new Set((levelSkills || []).filter(k => (Number(k.stage) || 1) <= stage).map(k => k.id))
      const { data: existing } = await supabase
        .from('student_skill_progress').select('skill_id, progress_percent').eq('student_id', student_id)
      for (const row of existing || []) stored[row.skill_id] = row.progress_percent
    }
  }

  // What the coach may change, they changed. Everything else keeps the value
  // already on file, so the snapshot stays a complete picture of the level.
  const accepted: Record<string, number> = {}
  for (const [skill_id, pct] of Object.entries(progress)) {
    accepted[skill_id] = allowed && !allowed.has(skill_id)
      ? (stored[skill_id] ?? 0)
      : (pct as number)
  }

  const upserts = Object.entries(accepted)
    .filter(([skill_id]) => !allowed || allowed.has(skill_id))
    .map(([skill_id, pct]) => ({
      student_id,
      skill_id,
      progress_percent: pct as number,
      last_updated_by: coach.id,
      last_updated_at: new Date().toISOString()
    }))

  if (upserts.length > 0) {
    const { error } = await supabase
      .from('student_skill_progress')
      .upsert(upserts, { onConflict: 'student_id,skill_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await supabase.from('progress_history').insert({
    student_id,
    coach_id: coach.id,
    snapshot: accepted,
    session_date: today,
    class_session_id: class_session_id || null,
    status: 'pending_review'
  })

  return NextResponse.json({ ok: true })
}
