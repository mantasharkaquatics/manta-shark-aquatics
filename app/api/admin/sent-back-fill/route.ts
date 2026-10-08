import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { pictureAsOf } from '@/lib/skill-progress-sync'
import { levelAtLesson } from '@/lib/level-change'
import { laWallTimeToUtcMs } from '@/lib/date'

const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status })

/**
 * A report that was sent back to the coach, filed by an admin instead, from
 * the Reviews "sent back" list (owner, 2026-10-08). The way out when the
 * coach has left, or nobody is going to file it again: before this, only the
 * coach who filed it could, and the Reviews list had no button.
 *
 * Same as the "missing progress" fill (/api/coach/progress POST, admin only):
 * the scores of the level the swimmer was in AT THAT LESSON, untouched skills kept as the swimmer
 * stood on that lesson's day, queued as pending_review for the usual confirm.
 * The difference is that the lesson already has its (sent-back) row, so that
 * row is filed again rather than a second one added -- one report per
 * swimmer per lesson, as lesson-note keeps it. It goes under the lesson's
 * coach now. The note stays sent back; the card is confirmed without one.
 *
 * An assessment (no level yet) is filed through /api/admin/backfill-assessment,
 * which takes over the sent-back row the same way.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { history_id, progress } = body
  if (!history_id || !progress || typeof progress !== 'object' || Array.isArray(progress)) {
    return fail(400, 'Missing data', 'missing_fields')
  }
  for (const v of Object.values(progress)) {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) {
      return fail(400, 'Each skill score must be a whole number from 0 to 100', 'bad_score')
    }
  }
  const svc = auth.svc

  const { data: hist } = await svc.from('progress_history')
    .select('id, student_id, coach_id, class_session_id, session_date, status').eq('id', history_id).maybeSingle()
  if (!hist) return fail(404, 'Not found', 'not_found')
  if (hist.status !== 'rejected') return fail(409, 'This report has been filed again already. Refresh Reviews.', 'already_filed')

  const { data: student } = await svc.from('students')
    .select('id, current_level').eq('id', hist.student_id).maybeSingle()
  if (!student) return fail(404, 'Student not found', 'not_found')
  // No level: the lesson was the assessment, filed with its level.
  if (!student.current_level) {
    return fail(409, 'This swimmer has no level yet. Assign one on the Levels page first.', 'no_level')
  }

  // The lesson's coach today (a lesson can move after the send-back); the
  // report's own coach if the lesson has none.
  const { data: session } = hist.class_session_id
    ? await svc.from('class_sessions').select('coach_id, start_time').eq('id', hist.class_session_id).maybeSingle()
    : { data: null }
  const coachId: string | null = session?.coach_id || hist.coach_id || null
  if (!coachId) return fail(400, 'This session has no assigned coach', 'no_coach')

  // The level of the lesson, not today's: a report for a lesson before the
  // swimmer moved up was filed with the NEW level's skills under the old date
  // -- the coach is told to leave exactly this case to the admin
  // (levelChangedSince), and the admin then had only the wrong list
  // (found 2026-10-08). Same reading as the coach's recorder.
  const { level: lessonLevel, error: lvlErr } = await levelAtLesson(svc, {
    studentId: hist.student_id,
    lessonStartMs: hist.session_date ? laWallTimeToUtcMs(hist.session_date, String(session?.start_time || '00:00').slice(0, 5)) : NaN,
    currentLevel: student.current_level,
  })
  if (lvlErr) return fail(500, lvlErr.message, 'server')
  // Any skill of that level; the rest of the level kept as it stood on the
  // lesson's day (see /api/coach/progress POST for why both).
  const { data: lvl } = await svc.from('levels').select('id').eq('level_number', lessonLevel || student.current_level).maybeSingle()
  if (!lvl) return fail(400, 'That level does not exist', 'bad_level')
  const { data: levelSkills } = await svc.from('skills').select('id').eq('level_id', lvl.id).eq('is_active', true)
  const allowed = new Set<string>((levelSkills || []).map((k: { id: string }) => k.id))
  const { data: liveRows } = await svc.from('student_skill_progress')
    .select('skill_id, progress_percent').eq('student_id', hist.student_id)
  const live: Record<string, number> = {}
  for (const r of liveRows || []) live[r.skill_id] = r.progress_percent
  let stored: Record<string, number>
  try {
    stored = await pictureAsOf(svc, hist.student_id, hist.session_date, live)
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : 'Could not read the swimmer\'s progress', 'server')
  }
  const snapshot: Record<string, number> = {}
  for (const id of allowed) snapshot[id] = id in progress ? Number(progress[id]) : (stored[id] ?? 0)
  if (Object.keys(snapshot).length === 0) return fail(400, 'That level has no skills', 'bad_level')

  // Only while it is still sent back: the coach filing it again at the same
  // moment wins, and this says so.
  const { data: filed, error } = await svc.from('progress_history')
    .update({ snapshot, coach_id: coachId, status: 'pending_review', reviewed_by: null, reviewed_at: null })
    .eq('id', hist.id).eq('status', 'rejected').select('id')
  if (error) return fail(500, error.message, 'server')
  if (!filed || filed.length === 0) return fail(409, 'This report has been filed again already. Refresh Reviews.', 'already_filed')
  return NextResponse.json({ ok: true })
}
