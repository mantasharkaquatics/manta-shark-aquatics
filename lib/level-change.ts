/* eslint-disable @typescript-eslint/no-explicit-any */
import { isLevelNumber } from './levels'

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
