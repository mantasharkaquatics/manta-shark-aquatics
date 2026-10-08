/* eslint-disable @typescript-eslint/no-explicit-any */
import { refreshNoteTranslations } from '@/lib/ai/translate-note'
import { isLevelNumber } from '@/lib/levels'
import { setStudentLevel } from '@/lib/level-change'
import {
  isRecommendedCourse, isWeeklyFrequency, RECOMMENDATION_NOTE_MAX, CREDIT_DAYS,
  addDays, translateRecommendation,
} from '@/lib/assessments'
import { formatDateLA } from '@/lib/date'
import { sendEmail } from '@/lib/email'

export type ConfirmAssessmentInput = {
  history_id?: string
  recommendation_id?: string
  final_level?: unknown
  updated_snapshot?: Record<string, unknown> | null
  note_id?: string | null
  note_text?: string | null
  recommended_course?: unknown
  weekly_frequency?: unknown
  recommendation_note?: unknown
}

/**
 * `code` is what the admin screen translates (the English `error` is for logs
 * and anyone calling the API by hand): missing_fields, bad_level,
 * pick_recommendation, note_too_long, not_found, mismatch, already_confirmed,
 * has_level, busy, failed, server.
 */
export type ConfirmResult = { status: number; body: { ok: true } | { error: string; code: string } }
const err = (status: number, error: string, code: string): ConfirmResult => ({ status, body: { error, code } })

/**
 * The day the 60-day assessment credit runs from: the later of the lesson and
 * the day the report was filed.
 *
 * A coach files the assessment on the day (their Progress page lists only
 * today's lessons), so for an ordinary report the two are the same day. A
 * report an admin BACKFILLS for an assessment the coach missed is filed later,
 * and the owner's rule (2026-10-08) is that the family's 60 days then run from
 * the backfill: until then they had no report and no countdown to see. Read
 * off the row itself, so a backfill whose confirm failed half-way and is then
 * confirmed again from its Reviews card keeps the same rule.
 */
export function creditStartDate(assessedOn: string, filedAt: string | null | undefined): string {
  if (!filedAt) return assessedOn
  const t = new Date(filedAt)
  if (Number.isNaN(t.getTime())) return assessedOn
  const filedOn = formatDateLA(t)
  return filedOn > assessedOn ? filedOn : assessedOn
}

/**
 * Confirms a swimmer's assessment: the level, the skill scores and the lesson
 * note, in one step. Reviews shows them as one card for the same reason the
 * ordinary lesson report pairs its note with its scores -- a family must never
 * read a note whose level is still undecided. Used by
 * /api/admin/review-assessment (the coach's report) and
 * /api/admin/backfill-assessment (one the coach missed, filed by an admin), so
 * a backfilled assessment gets the same report, email and credit.
 *
 * Order matters, because PostgREST gives us no transaction:
 *  1. everything is read and checked first, so a bad request writes nothing;
 *     then the pending report is claimed, so a second confirm stops here;
 *  2. the scores go live, then the level moves (history row first, see
 *     setStudentLevel) -- in that order so the swimmer starts at stage 1;
 *  3. the note;
 *  4. the family's report is written (course, frequency, the 60-day credit),
 *     then the recommendation is closed -- while it is pending, Reviews still
 *     shows the card as an assessment, so a retry runs this confirm again;
 *  5. the report itself is approved LAST. Reviews lists the card for as long
 *     as the report is pending, so any failure before this point leaves the
 *     card on screen to confirm again -- and a retry is safe: step 2 is skipped
 *     when the swimmer is already at the chosen level, the rest are updates
 *     (the report row is an upsert on the swimmer, and never resets a credit).
 *  6. the email telling the family the report is ready, once, best effort.
 */
export async function confirmAssessment(svc: any, adminId: string, input: ConfirmAssessmentInput): Promise<ConfirmResult> {
  const { history_id, recommendation_id, final_level, updated_snapshot, note_id, note_text,
    recommended_course, weekly_frequency, recommendation_note } = input
  if (!history_id || !recommendation_id) return err(400, 'Missing fields', 'missing_fields')
  if (!isLevelNumber(final_level)) return err(400, 'That level does not exist', 'bad_level')
  const level = Number(final_level)
  // The family's report says which course and how often; both are the admin's call.
  if (!isRecommendedCourse(recommended_course)) return err(400, 'Pick the course to recommend', 'pick_recommendation')
  if (!isWeeklyFrequency(weekly_frequency)) return err(400, 'Pick how many lessons a week to recommend', 'pick_recommendation')
  const reasonText = String(recommendation_note ?? '').trim()
  if (reasonText.length > RECOMMENDATION_NOTE_MAX) {
    return err(400, `Keep the recommendation to ${RECOMMENDATION_NOTE_MAX} characters`, 'note_too_long')
  }

  const [{ data: rec }, { data: hist }] = await Promise.all([
    svc.from('level_recommendations').select('id, student_id, recommended_level, status').eq('id', recommendation_id).single(),
    svc.from('progress_history').select('id, student_id, coach_id, snapshot, status, lesson_key, session_date, class_session_id, created_at').eq('id', history_id).single(),
  ])
  if (!rec || !hist) return err(404, 'Not found', 'not_found')
  if (rec.student_id !== hist.student_id) return err(400, 'That level and that report are for different swimmers', 'mismatch')
  // The report is approved last, so while it is pending the confirm has not
  // finished and may run again -- even if the recommendation already closed.
  if (hist.status !== 'pending_review' || !['pending', 'approved', 'modified'].includes(rec.status)) {
    return err(409, 'This assessment has already been confirmed', 'already_confirmed')
  }
  const { data: student } = await svc
    .from('students').select('id, current_level, parent_id, full_name').eq('id', rec.student_id).single()
  if (!student) return err(404, 'Student not found', 'not_found')
  if (student.current_level && String(student.current_level) !== String(level)) {
    return err(409, 'This swimmer already has a level. Change it on the Levels page instead.', 'has_level')
  }

  let note: { id: string } | null = null
  if (note_id) {
    const { data } = await svc.from('lesson_notes').select('id, student_id, lesson_key').eq('id', note_id).single()
    if (!data || data.student_id !== hist.student_id || data.lesson_key !== hist.lesson_key) {
      return err(400, 'That note belongs to another lesson', 'mismatch')
    }
    note = data
  }

  // Only real skills of the level the coach scored, with real values. The
  // admin may place the swimmer in a different level; the scores stay what
  // they were -- marks against the recommended level's list.
  const { data: scoredLvl } = await svc
    .from('levels').select('id').eq('level_number', Number(rec.recommended_level)).maybeSingle()
  const { data: scoredSkills } = scoredLvl
    ? await svc.from('skills').select('id').eq('level_id', scoredLvl.id)
    : { data: [] as { id: string }[] }
  const allowed = new Set((scoredSkills || []).map((k: { id: string }) => k.id))
  const source: Record<string, unknown> = (updated_snapshot && typeof updated_snapshot === 'object')
    ? { ...(hist.snapshot || {}), ...updated_snapshot } : (hist.snapshot || {})
  const snapshot: Record<string, number> = {}
  for (const [id, v] of Object.entries(source)) {
    const n = Number(v)
    if (allowed.has(id) && Number.isFinite(n) && n >= 0 && n <= 100) snapshot[id] = n
  }

  // Claim the report before writing anything. The checks above are reads, so
  // two confirms arriving together (two admins, a double click) both passed
  // them and both moved the level, translated and emailed (found 2026-10-04).
  // The claim is a short lease on the pending row: a confirm that fails below
  // releases it, and one that dies outright frees it after LEASE_MS, so the
  // card can still be confirmed again as step 5 above promises.
  const LEASE_MS = 90_000
  const claimAt = new Date().toISOString()
  const { data: claimed, error: claimErr } = await svc.from('progress_history')
    .update({ reviewed_by: adminId, reviewed_at: claimAt })
    .eq('id', history_id).eq('status', 'pending_review')
    .or(`reviewed_at.is.null,reviewed_at.lt."${new Date(Date.now() - LEASE_MS).toISOString()}"`)
    .select('id')
  if (claimErr) return err(500, claimErr.message, 'server')
  if (!claimed || claimed.length === 0) {
    return err(409, 'This assessment is being confirmed right now, or already has been. Refresh in a minute.', 'busy')
  }
  const fail = async (error: string, status: number) => {
    await svc.from('progress_history').update({ reviewed_by: null, reviewed_at: null })
      .eq('id', history_id).eq('status', 'pending_review').eq('reviewed_at', claimAt)
    return err(status, error, status >= 500 ? 'server' : 'failed')
  }

  // 2. The scores go live, THEN the level (owner's rule: whatever level the
  // assessment picks, everyone starts it at stage 1). The scores used to be
  // written after the level, "so the stage trigger reads the level the
  // swimmer is now in" -- and it did: check_level_upgrade moved a swimmer the
  // coach scored "on their own" on every stage-1 skill straight to stage 2
  // (or 3), under the coach's name in level_upgrades, while the report, the
  // email and the FAQ all said stage 1 (found 2026-10-07). Written while the
  // swimmer has no level, the trigger returns at once (current_level IS
  // NULL), and setStudentLevel then puts them at stage 1. The scores still
  // stand in the live table and form the report; the trigger acts on them at
  // the next approved lesson report, which is the normal way a stage moves.
  //
  // A retry after the level was already set (a failure further down) writes
  // the scores with the level in place. Then the stage is read before and
  // after, and if this write moved it, it is put back -- recorded in
  // level_upgrades like every other stage move.
  // last_updated_by is an FK to coaches: the lesson's coach goes there; who
  // confirmed is on the history row.
  const now = new Date().toISOString()
  const upserts = Object.entries(snapshot).map(([skill_id, pct]) => ({
    student_id: rec.student_id,
    skill_id,
    progress_percent: Number(pct) || 0,
    last_updated_by: hist.coach_id ?? null,
    last_updated_at: now,
  }))
  let stageBefore: number | null = null
  if (student.current_level && upserts.length > 0) {
    const { data: s0, error: s0Err } = await svc.from('students').select('current_stage').eq('id', rec.student_id).single()
    if (s0Err) return fail(s0Err.message, 500)
    stageBefore = Number(s0?.current_stage) || 1
  }
  if (upserts.length > 0) {
    const { error } = await svc.from('student_skill_progress').upsert(upserts, { onConflict: 'student_id,skill_id' })
    if (error) return fail(error.message, 500)
  }
  if (!student.current_level) {
    const moved = await setStudentLevel(svc, { studentId: rec.student_id, toLevel: level, adminId, notes: 'Assessment' })
    if (!moved.ok) return fail(moved.error, moved.status)
  } else if (stageBefore != null) {
    const { data: s1 } = await svc.from('students').select('current_level, current_stage').eq('id', rec.student_id).single()
    const stageAfter = Number(s1?.current_stage) || 1
    if (s1 && stageAfter > stageBefore) {
      // History row first, then the student, as setStudentLevel does.
      const { data: back, error: backErr } = await svc.from('level_upgrades').insert({
        student_id: rec.student_id,
        from_level: s1.current_level,
        to_level: s1.current_level,
        from_stage: stageAfter,
        to_stage: stageBefore,
        upgraded_by: adminId,
        notes: 'Assessment: the level starts at stage 1',
      }).select('id').single()
      if (backErr || !back) return fail(backErr?.message || 'Could not record the stage change', 500)
      const { data: reverted, error: stErr } = await svc.from('students').update({ current_stage: stageBefore })
        .eq('id', rec.student_id).eq('current_stage', stageAfter).select('id')
      if (stErr) {
        await svc.from('level_upgrades').delete().eq('id', back.id)
        return fail(stErr.message, 500)
      }
      // Moved by someone else in between: nothing was reverted here, so the
      // history row that says it was goes too.
      if (!reverted || reverted.length === 0) await svc.from('level_upgrades').delete().eq('id', back.id)
    }
  }

  if (note) {
    const { error: noteErr } = await svc.from('lesson_notes').update({
      note: String(note_text ?? '').trim(),
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: now,
      updated_at: now,
    }).eq('id', note.id)
    if (noteErr) return fail(noteErr.message, 500)
    await refreshNoteTranslations(svc, note.id)
  }

  // 4. The family's report. The assessment booking gives the date the 60 days
  // run from; the history row's own date stands in if it cannot be found.
  const sessionId = hist.class_session_id || hist.lesson_key
  const { data: trial } = sessionId ? await svc.from('bookings')
    .select('id').eq('student_id', rec.student_id).eq('class_session_id', sessionId).eq('is_trial', true)
    .neq('status', 'cancelled').limit(1).maybeSingle() : { data: null }
  const { data: sess } = sessionId
    ? await svc.from('class_sessions').select('session_date').eq('id', sessionId).maybeSingle()
    : { data: null }
  const assessedOn: string = sess?.session_date || hist.session_date || now.slice(0, 10)
  const creditDeadline = addDays(creditStartDate(assessedOn, hist.created_at), CREDIT_DAYS)
  const { data: existing } = await svc.from('student_assessments')
    .select('recommendation_note, recommendation_note_i18n, emailed_at').eq('student_id', rec.student_id).maybeSingle()
  // A retry with the same words does not pay for the translation twice.
  const i18n = existing && (existing.recommendation_note || '') === reasonText
    ? (existing.recommendation_note_i18n || {})
    : await translateRecommendation(svc, reasonText)
  const { error: reportErr } = await svc.from('student_assessments').upsert({
    student_id: rec.student_id,
    parent_id: student.parent_id,
    booking_id: trial?.id ?? null,
    progress_history_id: hist.id,
    lesson_note_id: note?.id ?? null,
    assessed_on: assessedOn,
    level_number: level,
    recommended_course,
    weekly_frequency,
    recommendation_note: reasonText || null,
    recommendation_note_i18n: i18n,
    confirmed_by: adminId,
    confirmed_at: now,
    credit_deadline: creditDeadline,
  }, { onConflict: 'student_id' })
  if (reportErr) return fail(reportErr.message, 500)

  // 4, last part. Close the recommendation (a retry finds it closed and leaves
  // it). After the family's report, not before it: Reviews pairs the pending
  // report with the swimmer's PENDING recommendation to show it as an
  // assessment card. Closed first, a failure in the family's report (the
  // translation above timing out) left an ordinary-looking card whose
  // "confirm" published the note and scores with no assessment report and no
  // credit (found 2026-10-08).
  const { error: recErr } = rec.status !== 'pending' ? { error: null } : await svc.from('level_recommendations').update({
    status: level === Number(rec.recommended_level) ? 'approved' : 'modified',
    reviewed_by: adminId,
    final_level: level,
    reviewed_at: now,
  }).eq('id', recommendation_id)
  if (recErr) return fail(recErr.message, 500)

  // 5. The report, last: this is what takes the card out of Reviews.
  const { error: histErr } = await svc.from('progress_history').update({
    status: 'approved', reviewed_by: adminId, reviewed_at: now, snapshot,
  }).eq('id', history_id)
  if (histErr) return fail(histErr.message, 500)

  // 6. Tell the family, once. Best effort: the report is on the dashboard either way.
  // Claim emailed_at first so two confirms cannot both send; a failed send
  // gives the claim back (found 2026-10-04).
  const { data: mailClaim } = existing?.emailed_at ? { data: [] } : await svc.from('student_assessments')
    .update({ emailed_at: new Date().toISOString() })
    .eq('student_id', rec.student_id).is('emailed_at', null)
    .select('student_id')
  if (mailClaim && mailClaim.length > 0) {
    let sent = false
    try {
      const { data: fam } = await svc.from('parents')
        .select('email, first_name, preferred_language').eq('id', student.parent_id).maybeSingle()
      if (fam?.email) {
        const lang = String(fam.preferred_language || 'en')
        sent = await sendEmail({
          type: 'assessment_report', to: fam.email, parentName: fam.first_name || '',
          studentName: student.full_name || '', lang,
          level, course: recommended_course, frequency: weekly_frequency,
          reason: reasonText ? (i18n[lang] || reasonText) : '',
          creditDeadline: creditDeadline,
        })
      }
    } catch (e) {
      console.error('review-assessment: report saved, email failed:', e)
    }
    if (!sent) await svc.from('student_assessments').update({ emailed_at: null }).eq('student_id', rec.student_id)
  }

  return { status: 200, body: { ok: true } }
}
