/* eslint-disable @typescript-eslint/no-explicit-any */
import { isLevelNumber } from './levels'
import { allRowsIn } from './db-paging'

/**
 * Moves a swimmer to a level and writes the history row, as one step.
 *
 * Every route that sets current_level goes through here, so the rules live in
 * one place:
 *  - the level must be one that exists (1..MAX_LEVEL);
 *  - the swimmer starts the new level at stage 1 (the owner's rule);
 *  - the history row is written FIRST. The review route used to update the
 *    student and then insert the history; when the insert failed (a new swimmer
 *    has no from_level, and the column did not allow that) the student had
 *    already moved, the family saw the new level, and the recommendation stayed
 *    pending in the admin queue. Now a failed history insert changes nothing,
 *    and a failed student update removes the history row it just wrote.
 */
export async function setStudentLevel(
  svc: any,
  { studentId, toLevel, adminId, notes }: { studentId: string; toLevel: number | string; adminId: string; notes?: string | null },
): Promise<{ ok: true; record: any } | { ok: false; status: number; error: string }> {
  if (!studentId) return { ok: false, status: 400, error: 'Missing student' }
  if (!isLevelNumber(toLevel)) return { ok: false, status: 400, error: 'That level does not exist' }
  const to = String(Number(toLevel))

  const { data: student, error: readErr } = await svc
    .from('students').select('current_level, current_stage').eq('id', studentId).single()
  if (readErr || !student) return { ok: false, status: 404, error: readErr?.message || 'Student not found' }

  const { data: record, error: insertErr } = await svc
    .from('level_upgrades')
    .insert({
      student_id: studentId,
      from_level: student.current_level ?? null,
      to_level: to,
      from_stage: student.current_stage ?? null,
      to_stage: 1,
      upgraded_by: adminId,
      notes: notes || null,
    })
    .select('id, from_level, to_level, from_stage, to_stage, upgraded_at, notes')
    .single()
  if (insertErr || !record) return { ok: false, status: 500, error: insertErr?.message || 'Could not record the level change' }

  const { error: updateErr } = await svc
    .from('students').update({ current_level: to, current_stage: 1 }).eq('id', studentId)
  if (updateErr) {
    await svc.from('level_upgrades').delete().eq('id', record.id)
    return { ok: false, status: 500, error: updateErr.message }
  }
  return { ok: true, record }
}

/**
 * The level a swimmer was in when a lesson began: the from_level of their
 * first level_upgrades row at or after that moment (a stage move keeps the
 * level, so its from_level is still right), else the level they hold now.
 * The coach's recorder (/api/coach/progress GET) and the monthly report read it
 * the same way. A null from_level -- they had no level then -- falls back to
 * today's level, the only list of skills there is to file against.
 *
 * `moves` are that swimmer's rows, any order.
 */
export function levelThenFromMoves(
  moves: { from_level: string | number | null; upgraded_at: string }[],
  lessonStartMs: number,
  currentLevel: string | number | null,
): string | null {
  let first: { from_level: string | number | null; upgraded_at: string } | null = null
  for (const m of moves) {
    const t = Date.parse(m.upgraded_at)
    if (!(t >= lessonStartMs)) continue
    if (!first || t < Date.parse(first.upgraded_at)) first = m
  }
  const then = first?.from_level ?? currentLevel
  return then == null ? null : String(then)
}

/** levelThenFromMoves for one lesson, read from the database. */
export async function levelAtLesson(
  svc: any,
  { studentId, lessonStartMs, currentLevel }: { studentId: string; lessonStartMs: number; currentLevel: string | number | null },
): Promise<{ level: string | null; error: any }> {
  if (!Number.isFinite(lessonStartMs)) return { level: currentLevel == null ? null : String(currentLevel), error: null }
  const { data, error } = await svc.from('level_upgrades')
    .select('from_level, upgraded_at').eq('student_id', studentId)
    .gte('upgraded_at', new Date(lessonStartMs).toISOString())
    .order('upgraded_at', { ascending: true }).limit(1)
  if (error) return { level: null, error }
  return { level: levelThenFromMoves(data || [], lessonStartMs, currentLevel), error: null }
}

/**
 * Swimmers among `studentIds` with an assessment report on its way: waiting in
 * Reviews (pending_review) or sent back to the coach. Every report filed for a
 * swimmer with no level is an assessment (/api/coach/lesson-note), so callers
 * pass swimmers with no level. Their level has to come from confirming that
 * report, or the family gets no assessment report, email or 85-point credit
 * (found 2026-10-08) -- /api/admin/assign-level refuses them and the Levels
 * page says so.
 *
 * "Sent back" is read as the Reviews list reads it (review-queues
 * loadSentBack): with docs/migration-report-sendback.sql run, only rows with
 * sent_back_at, so an older 'rejected' row nobody can act on never blocks.
 */
export async function assessmentWaitingIds(svc: any, studentIds: string[]): Promise<{ ids: Set<string>; error: any }> {
  const ids = new Set<string>()
  if (studentIds.length === 0) return { ids, error: null }
  const pending = await allRowsIn(studentIds, c => svc.from('progress_history').select('id, student_id')
    .in('student_id', c).eq('status', 'pending_review').order('id'))
  if (pending.error) return { ids, error: pending.error }
  for (const r of pending.data) ids.add(r.student_id)
  let sent = await allRowsIn(studentIds, c => svc.from('progress_history').select('id, student_id')
    .in('student_id', c).eq('status', 'rejected').not('sent_back_at', 'is', null).order('id'))
  if (sent.error && (sent.error.code === '42703' || sent.error.code === 'PGRST204' || /sent_back_at/.test(sent.error.message || ''))) {
    sent = await allRowsIn(studentIds, c => svc.from('progress_history').select('id, student_id')
      .in('student_id', c).eq('status', 'rejected').order('id'))
  }
  if (sent.error) return { ids, error: sent.error }
  for (const r of sent.data) ids.add(r.student_id)
  return { ids, error: null }
}
