import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { requireStaff, requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { isLevelNumber } from '@/lib/levels'
import { pendingOverlay, pictureAsOf, pictureAsOfRows, overlayFromRows, type Snapshot } from '@/lib/skill-progress-sync'
import { laWallTimeToUtcMs } from '@/lib/date'
import { NOT_REAL_BOOKING_STATUSES } from '@/app/coach/real-booking'

const NOT_REAL = `(${NOT_REAL_BOOKING_STATUSES.join(',')})`

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

  /* A coach reads only a swimmer in a lesson they teach (owner, 2026-10-08).
     This answered any student id for any staff member, so a coach account
     could read every child's name, level and scores. Same test as the report
     itself (/api/coach/lesson-note): the session is this coach's, and the
     swimmer has a real booking in it -- or, for an hour lesson, in its other
     half (a real booking sharing a lesson_group_id with one in this session).
     Both coach screens that call this pass the session the swimmer is booked
     in. Admins are unchanged. */
  if (staff.role === 'coach') {
    const { data: caller } = await supabase
      .from('coaches').select('id').eq('auth_user_id', staff.user.id).eq('is_active', true).maybeSingle()
    if (!caller || !classSessionId) return NextResponse.json({ error: 'Not your lesson' }, { status: 403 })
    const { data: session } = await supabase
      .from('class_sessions').select('id, coach_id').eq('id', classSessionId).maybeSingle()
    if (!session || session.coach_id !== caller.id) {
      return NextResponse.json({ error: 'Not your lesson' }, { status: 403 })
    }
    const { data: inSession } = await supabase
      .from('bookings').select('student_id, lesson_group_id')
      .eq('class_session_id', classSessionId).not('status', 'in', NOT_REAL)
    const rows: { student_id: string | null; lesson_group_id: string | null }[] = inSession || []
    let booked = rows.some(b => b.student_id === studentId)
    const groups = [...new Set(rows.map(b => b.lesson_group_id).filter((g): g is string => !!g))]
    if (!booked && groups.length > 0) {
      const { data: inGroup } = await supabase
        .from('bookings').select('id')
        .eq('student_id', studentId).in('lesson_group_id', groups)
        .not('status', 'in', NOT_REAL).limit(1)
      booked = !!inGroup?.length
    }
    if (!booked) return NextResponse.json({ error: 'This swimmer is not booked in this lesson.' }, { status: 403 })
  }

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, current_level, current_stage')
    .eq('id', studentId)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  /* The lesson's own date. A report the admin sent back can be for any past
     lesson (owner, 2026-10-08), and re-recording it must start from where the
     swimmer stood THEN, not today: the recorder sends its whole picture as
     that lesson's snapshot, so a 9/29 report sent back after 10/1 was
     approved went back in with October's scores under a September date --
     the problem pictureAsOf fixed for late records (found 2026-10-08). */
  let lessonDate: string | null = null
  let lessonStart: string | null = null
  if (classSessionId) {
    const { data: ls } = await supabase
      .from('class_sessions').select('session_date, start_time').eq('id', classSessionId).maybeSingle()
    lessonDate = ls?.session_date || null
    lessonStart = ls?.start_time ? String(ls.start_time).slice(0, 5) : null
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
      // A report an admin sent back is the coach's to file again.
      .neq('status', 'rejected')
      .limit(1)
    todayLocked = !!(todayHistoryRows && todayHistoryRows.length > 0)
  } else {
    const { data: todayHistoryRows } = await supabase
      .from('progress_history')
      .select('id')
      .eq('student_id', studentId)
      .eq('session_date', today)
      .neq('status', 'rejected')
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
  const pastLesson = !!lessonDate && lessonDate < today

  /* A past lesson for a swimmer who has changed level since. Its report was
     about the old level's skills; the recorder can only offer the current
     level's, and filing those under the old date would put new-level scores
     in a September report. The coach is told to leave it to the admin, and is
     given nothing to send. The level then is the "from" of the first level
     change after the lesson began (as lib/monthly-reports reads month-end). */
  if (pastLesson) {
    const { data: laterMoves } = await supabase.from('level_upgrades')
      .select('from_level').eq('student_id', studentId)
      .gte('upgraded_at', new Date(laWallTimeToUtcMs(lessonDate!, lessonStart || '00:00')).toISOString())
      .order('upgraded_at', { ascending: true }).limit(1)
    const levelThen = laterMoves && laterMoves.length > 0 ? laterMoves[0].from_level : student.current_level
    if (String(levelThen ?? '') !== String(student.current_level ?? '')) {
      return NextResponse.json({
        student: { ...student, level: null }, skills: [], progress: {}, pendingSkillIds: [], todayLocked,
        assessment: false, assessedLevel: null, levelChangedSince: true,
        coachDefaultLanguage: me?.default_note_language || 'en',
      })
    }
  }

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

  const live: Snapshot = {}
  for (const row of progressRows || []) {
    live[row.skill_id] = row.progress_percent
  }
  /* The live table now waits for the admin's confirm (owner, 2026-10-05), so
     on its own it no longer holds what this coach sent last lesson. Their
     reports still in Reviews are laid over it: the recorder opens on the marks
     they last sent, and the next report carries them forward rather than
     quietly sending the older approved values back.
     A past lesson (a sent-back report) starts from the picture as of that day
     instead: pictureAsOf's approved scores then, with only the reports up to
     that day laid over them. */
  let approved: Snapshot = live
  let pending: Snapshot = {}
  if (!assessment && pastLesson) {
    const { data: hist, error: histErr } = await supabase
      .from('progress_history')
      .select('snapshot, status, session_date, created_at')
      .eq('student_id', studentId)
      .in('status', ['pending_review', 'approved'])
      .order('session_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (histErr) return NextResponse.json({ error: 'Could not read progress history' }, { status: 500 })
    const rows = hist || []
    approved = pictureAsOfRows(live, rows.filter((r: { status: string }) => r.status === 'approved'), lessonDate)
    pending = overlayFromRows(rows.filter((r: { session_date: string }) => String(r.session_date) <= String(lessonDate)))
  } else if (!assessment) {
    pending = await pendingOverlay(supabase, studentId)
  }
  const progressMap: Record<string, number> = { ...approved, ...pending }
  // Which marks are still waiting in Reviews, so the Today panel can say
  // "pending" instead of looking like the report never arrived. Only the ones
  // a waiting report actually changes: a report carries the swimmer's whole
  // level, so every scored skill used to be tagged when one had moved
  // (found 2026-10-08).
  const skillIds = new Set((skills || []).map((k: { id: string }) => k.id))
  const pendingSkillIds = Object.keys(pending).filter(id => skillIds.has(id) && pending[id] !== approved[id])

  return NextResponse.json({
    // In an assessment the student row still has no level; `level` here is the
    // one being assessed against, and `assessment` tells the page which it is.
    student: { ...student, level: assessment ? null : levelData },
    assessedLevel: assessment ? levelData.level_number : null,
    assessment,
    skills: skills || [],
    progress: progressMap,
    pendingSkillIds,
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
  if (!coach_id) return NextResponse.json({ error: 'This session has no assigned coach', code: 'no_coach' }, { status: 400 })

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
    return NextResponse.json({ error: 'This swimmer has no level yet. Assign one on the Levels page first.', code: 'no_level' }, { status: 409 })
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
      // And the approved scores as of that lesson, not the newest ones: the
      // live table also holds later lessons' approved scores, which a late
      // record for an earlier lesson must not carry (found 2026-10-07; same
      // picture as the Reviews card prefills).
      stored = await pictureAsOf(supabase, student_id, today, stored)
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
