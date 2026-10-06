import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireStaff, requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { isLevelNumber } from '@/lib/levels'
import { pendingOverlay } from '@/lib/skill-progress-sync'

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

  /* A swimmer with no level is in their assessment. The coach picks the level
     they would place them in and scores that level's skills in the same report,
     so ?level=N asks for a level the swimmer is not in yet. It is honoured only
     while they have no level: it must never become a way to write skills of
     some other level for a placed swimmer. */
  const wantLevel = req.nextUrl.searchParams.get('level')
  const assessment = !student.current_level
  const levelNumber = student.current_level || (wantLevel && isLevelNumber(wantLevel) ? String(Number(wantLevel)) : null)

  let levelData = null
  if (levelNumber) {
    const { data: level } = await supabase
      .from('levels')
      .select('id, level_number, name')
      .eq('level_number', levelNumber)
      .single()
    levelData = level
  }

  if (!levelData) {
    return NextResponse.json({
      student: { ...student, level: null }, skills: [], progress: {}, todayLocked, assessment,
      assessedLevel: null, coachDefaultLanguage: me?.default_note_language || 'en',
    })
  }

  const { data: skills } = await supabase
    .from('skills')
    // pass_criteria rides along: a coach deciding between 60 and 80 needs the
    // standard in front of them, not in a handbook they would have to go and open.
    .select('id, name, sort_order, stage, pass_criteria')
    .eq('level_id', levelData.id)
    // A retired skill is not taught or scored any more. The parent's view and
    // the save below both leave it out; the recorder has to as well, or the
    // coach scores something the save then quietly drops.
    .eq('is_active', true)
    .order('stage')
    .order('sort_order')

  // An assessment starts from nothing on file, whatever the table holds.
  const { data: progressRows } = assessment
    ? { data: [] as { skill_id: string; progress_percent: number }[] }
    : await supabase
      .from('student_skill_progress')
      .select('skill_id, progress_percent')
      .eq('student_id', studentId)

  const progressMap: Record<string, number> = {}
  for (const row of progressRows || []) {
    progressMap[row.skill_id] = row.progress_percent
  }
  /* The live table now waits for the admin's confirm (owner, 2026-10-05), so
     on its own it no longer holds what this coach sent last lesson. Their
     reports still in Reviews are laid over it: the recorder opens on the marks
     they last sent, and the next report carries them forward rather than
     quietly sending the older approved values back. */
  if (!assessment) Object.assign(progressMap, await pendingOverlay(supabase, studentId))

  return NextResponse.json({
    // In an assessment the student row still has no level; `level` here is the
    // one being assessed against, and `assessment` tells the page which it is.
    student: { ...student, level: assessment ? null : levelData },
    assessedLevel: assessment ? levelData.level_number : null,
    assessment,
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

  // Admins only (found 2026-10-04). The one caller is the admin Reviews
  // "missing progress" form; coaches file progress through /api/coach/lesson-note
  // with a recording. requireStaff() let any coach in here, with no check that
  // the swimmer was in their lesson, so a coach could write any student's live
  // skill table and queue a history row without a note.
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { student_id, progress, session_date, class_session_id, coach_id: bodyCoachId } = body
  const coach_id: string | null = bodyCoachId || null
  if (!student_id || !progress || typeof progress !== 'object' || Array.isArray(progress)) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }
  // Every score is a whole percentage 0-100 (found 2026-10-04): nothing bounded
  // them, and a 150 or "abc" went straight into student_skill_progress and the
  // snapshot a parent reads.
  for (const v of Object.values(progress)) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) {
      return NextResponse.json({ error: 'Each skill score must be a whole number from 0 to 100' }, { status: 400 })
    }
  }
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
  // No level: that lesson is the assessment, filed with its level from the
  // coach's Progress page. Written here, the scores would go straight into
  // the live table with no level and nothing to review.
  if (!gateStudent?.current_level) {
    return NextResponse.json({ error: 'This swimmer has no level yet. Assign one on the Levels page first.' }, { status: 409 })
  }

  let allowed: Set<string> | null = null
  let stored: Record<string, number> = {}
  if (gateStudent?.current_level) {
    const { data: lvl } = await supabase
      .from('levels').select('id').eq('level_number', gateStudent.current_level).maybeSingle()
    if (lvl) {
      const { data: levelSkills } = await supabase
        .from('skills').select('id, stage').eq('level_id', lvl.id).eq('is_active', true)
      // Any skill in the level the swimmer is sitting in, whatever stage it
      // belongs to. The old rule refused to even RECORD a later stage, which
      // threw away real observations: a swimmer whose butterfly is still coming
      // could not be marked on freestyle distance, because butterfly happens to
      // sit in the stage before it. Stages still order the TEACHING; they no
      // longer decide what a coach is allowed to have seen. What a swimmer may
      // not do is jump a LEVEL -- that stays an admin decision.
      allowed = new Set((levelSkills || []).map(k => k.id))
      const { data: existing } = await supabase
        .from('student_skill_progress').select('skill_id, progress_percent').eq('student_id', student_id)
      for (const row of existing || []) stored[row.skill_id] = row.progress_percent
      // The live table holds approved scores only (since 3239cc3). Scores a
      // coach has reported for lessons up to this one, still waiting in
      // Reviews, are what the swimmer stood at by then: filling the untouched
      // skills from the live table alone wrote older numbers into a NEWER
      // record, which then rolled the coach's scores back once both were
      // confirmed (found 2026-10-06).
      Object.assign(stored, await pendingOverlay(supabase, student_id, today))
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

  // Queued only, like a coach's report: the live table is written when an
  // admin confirms the record in Reviews (/api/admin/review-progress), so the
  // stage trigger cannot move the swimmer on numbers nobody has confirmed
  // (owner, 2026-10-05).

  // The skills of the level nobody touched this time are recorded as they
  // stand, so the record is a complete picture of the level (and a card sent
  // without a mark is "no change", not a blank).
  const snapshot: Record<string, number> = { ...accepted }
  if (allowed) for (const id of allowed) if (!(id in snapshot)) snapshot[id] = stored[id] ?? 0

  // The insert error used to be ignored (found 2026-10-04): the form reported
  // success, the card left the list, and no record ever reached Reviews.
  const { error: historyError } = await supabase.from('progress_history').insert({
    student_id,
    coach_id: coach.id,
    snapshot,
    session_date: today,
    class_session_id: class_session_id || null,
    status: 'pending_review'
  })
  if (historyError) {
    console.error('coach/progress: progress history save failed', historyError)
    return NextResponse.json({ error: 'Could not save the progress record' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
