import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { getTodayLA } from '@/lib/date'
import { isLevelNumber } from '@/lib/levels'
import { isRecommendedCourse, isWeeklyFrequency, RECOMMENDATION_NOTE_MAX } from '@/lib/assessments'
import { confirmAssessment } from '@/lib/admin/confirm-assessment'
import { NOT_REAL_BOOKING_STATUSES } from '@/app/coach/real-booking'

const NOT_REAL = `(${NOT_REAL_BOOKING_STATUSES.join(',')})`

// The confirm translates the recommendation line, like review-assessment.
export const maxDuration = 60

const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status })

/**
 * An assessment the coach never filed, filed and confirmed by an admin from the
 * Reviews "missing progress" card (owner, 2026-10-08).
 *
 * Setting a level by hand on the Levels page left the family with no
 * assessment report, no email and no 85-point credit, because only the
 * assessment confirm writes student_assessments. This files what the coach
 * would have -- the level recommendation and the pending report, under the
 * lesson's coach -- and then runs the SAME confirm as a coach's assessment
 * card (lib/admin/confirm-assessment), so the family gets the report card and
 * the email, and the 60 days of the credit run from today, the confirm date
 * (owner, 2026-10-08: every assessment's 60 days run from the admin's confirm;
 * see creditStartDate).
 *
 * If the confirm fails after the report is filed, the report is left pending:
 * it is then an ordinary assessment card in Reviews and can be confirmed from
 * there, with the credit running from the day it is confirmed.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { student_id, class_session_id, level, snapshot, recommended_course, weekly_frequency, recommendation_note } = body
  const svc = auth.svc

  if (!student_id || !class_session_id) return fail(400, 'Missing fields', 'missing_fields')
  if (!isLevelNumber(level)) return fail(400, 'Pick the level to place the swimmer in', 'pick_level')
  if (!isRecommendedCourse(recommended_course) || !isWeeklyFrequency(weekly_frequency)) {
    return fail(400, 'Pick the course and how many lessons a week to recommend', 'pick_recommendation')
  }
  if (String(recommendation_note ?? '').trim().length > RECOMMENDATION_NOTE_MAX) {
    return fail(400, `Keep the recommendation to ${RECOMMENDATION_NOTE_MAX} characters`, 'note_too_long')
  }
  const levelNumber = Number(level)

  const { data: student } = await svc.from('students')
    .select('id, current_level').eq('id', student_id).maybeSingle()
  if (!student) return fail(404, 'Student not found', 'not_found')
  if (student.current_level) {
    return fail(409, 'This swimmer already has a level. Change it on the Levels page instead.', 'has_level')
  }

  // The lesson must be this swimmer's paid assessment, attended, and over.
  // (Read as a real booking, not only 'confirmed': a report sent back to the
  // coach is filed against whatever lesson-note accepted.)
  const [{ data: booking }, { data: session }] = await Promise.all([
    svc.from('bookings').select('id, lesson_group_id, is_trial, status')
      .eq('student_id', student_id).eq('class_session_id', class_session_id)
      .not('status', 'in', NOT_REAL).limit(1).maybeSingle(),
    svc.from('class_sessions').select('id, coach_id, session_date').eq('id', class_session_id).maybeSingle(),
  ])
  if (!booking || !session) return fail(404, 'That lesson was not found', 'not_found')
  if (!booking.is_trial) return fail(409, 'That lesson was not a Swim Assessment', 'not_assessment')
  if (String(session.session_date) > getTodayLA()) return fail(409, 'That assessment has not happened yet', 'not_assessment')

  // Nothing filed for this lesson yet: a pending report is confirmed from its
  // own card. One sent back to the coach may be filed here instead, from the
  // Reviews "sent back" list (owner, 2026-10-08: the coach may have left, or
  // the lesson moved): that row is taken over rather than a second added.
  const lessonKey = booking.lesson_group_id || class_session_id
  const { data: existing } = await svc.from('progress_history')
    .select('id, status').eq('student_id', student_id).eq('lesson_key', lessonKey)
  const sentBack = (existing || []).find((h: { status: string }) => h.status === 'rejected') || null
  if ((existing || []).some((h: { status: string }) => h.status !== 'rejected')) {
    return fail(409, 'A report for this lesson is already filed. Refresh Reviews.', 'already_filed')
  }
  if (!sentBack && booking.status !== 'confirmed') return fail(404, 'That lesson was not found', 'not_found')
  // The coach's report, sent back, already says the swimmer was there.
  if (!sentBack) {
    const { data: att } = await svc.from('attendance').select('booking_id').eq('booking_id', booking.id).limit(1)
    if (!att || att.length === 0) return fail(409, 'The swimmer was not checked in to that assessment', 'not_assessment')
  }
  if (!session.coach_id) return fail(409, 'That lesson has no coach assigned', 'no_coach')

  // The scores: every active skill of the chosen level, as marked (0 if not).
  const { data: lvl } = await svc.from('levels').select('id').eq('level_number', levelNumber).maybeSingle()
  if (!lvl) return fail(400, 'That level does not exist', 'bad_level')
  const { data: skills } = await svc.from('skills').select('id').eq('level_id', lvl.id).eq('is_active', true)
  const given: Record<string, unknown> = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {}
  const scores: Record<string, number> = {}
  for (const k of skills || []) {
    const n = Number(given[k.id])
    scores[k.id] = Number.isInteger(n) && n >= 0 && n <= 100 ? n : 0
  }
  if (Object.keys(scores).length === 0) return fail(400, 'That level has no skills', 'bad_level')

  // Filed as the coach would have: the recommendation first (see lesson-note),
  // then the pending report. Older pending recommendations for the swimmer are
  // closed, so the one filed here is the one Reviews pairs with the report.
  const { data: rec, error: recErr } = await svc.from('level_recommendations').insert({
    student_id,
    coach_id: session.coach_id,
    recommended_level: levelNumber,
    notes: null,
  }).select('id').single()
  if (recErr || !rec) return fail(500, recErr?.message || 'Could not file the level', 'server')
  await svc.from('level_recommendations').update({ status: 'rejected' })
    .eq('student_id', student_id).eq('status', 'pending').neq('id', rec.id)

  const filed = {
    student_id,
    coach_id: session.coach_id,
    snapshot: scores,
    session_date: session.session_date,
    class_session_id,
    lesson_group_id: booking.lesson_group_id || null,
    status: 'pending_review',
  }
  // A sent-back row is filed again only while it is still sent back: the
  // coach filing it at the same moment wins.
  const { data: hist, error: histErr } = sentBack
    ? await svc.from('progress_history')
      .update({ ...filed, reviewed_by: null, reviewed_at: null })
      .eq('id', sentBack.id).eq('status', 'rejected').select('id').maybeSingle()
    : await svc.from('progress_history').insert(filed).select('id').single()
  if (histErr || !hist) {
    await svc.from('level_recommendations').delete().eq('id', rec.id)
    if (sentBack && !histErr) return fail(409, 'A report for this lesson is already filed. Refresh Reviews.', 'already_filed')
    return fail(500, histErr?.message || 'Could not file the report', 'server')
  }

  const r = await confirmAssessment(svc, auth.admin.id, {
    history_id: hist.id,
    recommendation_id: rec.id,
    final_level: levelNumber,
    recommended_course,
    weekly_frequency,
    recommendation_note,
  })
  if (r.status !== 200) {
    // Filed but not confirmed: it waits in Reviews as an assessment card.
    return NextResponse.json({ ...r.body, queued: true }, { status: r.status })
  }
  return NextResponse.json({ ok: true })
}
