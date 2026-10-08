import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

const SENDBACK_REASON_MAX = 300

const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status })

/** Postgres / PostgREST: the column is not there yet (migration not run). */
const missingColumn = (e: { code?: string } | null) => !!e && (e.code === '42703' || e.code === 'PGRST204')

/**
 * Sends a pending lesson report back to its coach (owner, 2026-10-08): the
 * wrong swimmer, scores that cannot be right. The report is voided -- it never
 * reaches student_skill_progress and the family never sees it -- and the
 * lesson goes back on that coach's to-do list on /coach/progress with the
 * reason, where they record it again. Their resubmission (lesson-note) turns
 * the same rows back to pending_review, and the card returns here.
 *
 * Status 'rejected' on progress_history and its lesson note: every reader
 * that shows or applies a report already filters on approved / pending, so a
 * rejected row is invisible to the family, the monthly report, the coach's
 * score overlay and the Reviews queue. The reason needs
 * docs/migration-report-sendback.sql; before it is run the report is still
 * sent back, without the reason, and the answer says so.
 *
 * An assessment card carries the coach's level recommendation too; that is
 * closed with it, and the coach's resubmission files a new one.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { history_id, recommendation_id } = body
  const reason = String(body.reason ?? '').trim()
  if (!history_id) return fail(400, 'Missing fields', 'missing_fields')
  if (!reason) return fail(400, 'Say why the report is going back', 'reason_required')
  if (reason.length > SENDBACK_REASON_MAX) return fail(400, `Keep the reason to ${SENDBACK_REASON_MAX} characters`, 'reason_too_long')
  const svc = auth.svc

  const { data: hist } = await svc.from('progress_history')
    .select('id, student_id, lesson_key, status, reviewed_at').eq('id', history_id).maybeSingle()
  if (!hist) return fail(404, 'Not found', 'not_found')
  if (hist.status !== 'pending_review') return fail(409, 'This report has already been reviewed', 'already_reviewed')
  // An assessment confirm holds a 90-second lease on reviewed_at while it runs.
  if (hist.reviewed_at && Date.now() - new Date(hist.reviewed_at).getTime() < 90_000) {
    return fail(409, 'This report is being confirmed right now. Refresh in a minute.', 'busy')
  }

  const now = new Date().toISOString()
  const voided = { status: 'rejected' }
  let reasonSaved = true
  let res = await svc.from('progress_history')
    .update({ ...voided, sent_back_reason: reason, sent_back_at: now, sent_back_by: auth.admin.id })
    .eq('id', history_id).eq('status', 'pending_review').select('id')
  if (res.error && missingColumn(res.error)) {
    reasonSaved = false
    res = await svc.from('progress_history')
      .update(voided).eq('id', history_id).eq('status', 'pending_review').select('id')
  }
  if (res.error) {
    // 23514: a status CHECK that does not allow 'rejected' yet.
    if (res.error.code === '23514') {
      return fail(503, 'Run docs/migration-report-sendback.sql first', 'needs_migration')
    }
    return fail(500, res.error.message, 'server')
  }
  if (!res.data || res.data.length === 0) return fail(409, 'This report has already been reviewed', 'already_reviewed')

  // The note half of the same lesson. Best effort: if it stays pending it is
  // shown nowhere without its report, and the resubmission rewrites it anyway.
  if (hist.lesson_key) {
    const { error: noteErr } = await svc.from('lesson_notes').update({ status: 'rejected', updated_at: now })
      .eq('student_id', hist.student_id).eq('lesson_key', hist.lesson_key).eq('status', 'pending_review')
    if (noteErr) console.error('report-sendback: note not voided:', noteErr.message)
  }
  if (recommendation_id) {
    const { error: recErr } = await svc.from('level_recommendations')
      .update({ status: 'rejected', reviewed_by: auth.admin.id, reviewed_at: now })
      .eq('id', recommendation_id).eq('student_id', hist.student_id).eq('status', 'pending')
    if (recErr) console.error('report-sendback: recommendation not closed:', recErr.message)
  }

  return NextResponse.json({ ok: true, reasonSaved })
}
