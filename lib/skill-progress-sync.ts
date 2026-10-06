/* eslint-disable @typescript-eslint/no-explicit-any */
import { UNLOCK_VALUE } from './mastery'

/**
 * The live skill table (student_skill_progress) and the reports that feed it.
 *
 * Owner's rule (2026-10-05): a coach's report changes nothing the family sees
 * until an admin confirms it. The coach's lesson-note route used to write the
 * live table the moment a report was sent, and the stage trigger
 * (check_level_upgrade) fired on that write -- the parent card showed the new
 * stage while the report was still waiting in Reviews. Now the live table is
 * written only from APPROVED progress_history rows, by the admin routes that
 * approve or correct them, and every one of them goes through here.
 *
 * The coach still needs to see what they sent: pendingOverlay() hands their
 * recorder the scores still waiting for review, so the next lesson starts from
 * them rather than from the last approved picture.
 */

export type Snapshot = Record<string, number>

/** Real skill ids only, each a finite number from 0 to 100. Anything else is a
 *  stale tab or a hand-made request and never reaches the live table. */
export async function cleanSnapshot(svc: any, raw: unknown): Promise<Snapshot> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length === 0) return {}
  const { data: real } = await svc.from('skills').select('id').in('id', entries.map(([id]) => id))
  const known = new Set((real || []).map((k: { id: string }) => k.id))
  const out: Snapshot = {}
  for (const [id, v] of entries) {
    if (v === null || v === '' || typeof v === 'boolean') continue
    const n = Number(v)
    if (known.has(id) && Number.isFinite(n) && n >= 0 && n <= 100) out[id] = n
  }
  return out
}

/**
 * Writes the live value of each given skill from the swimmer's APPROVED
 * reports: per skill, the newest approved report that scored it. Newest by
 * lesson date, not by when it was confirmed -- an old lesson confirmed late
 * must not roll a skill back past a newer one. The parent dashboard merges the
 * approved snapshots the same way, so the live table and what the family sees
 * agree.
 *
 * Only the skills passed in are touched: a confirm or an edit can only move
 * the skills its own report holds.
 *
 * stageBack (report edits): the stage trigger only ever moves a swimmer
 * forward, so an admin lowering a skill of a stage the swimmer has already
 * passed left them in the later stage on numbers that no longer earn it. With
 * stageBack set, a skill that this write took from "on their own" to below it,
 * in a stage before the swimmer's current one, returns them to the first
 * stage that is no longer complete -- the same test the trigger promotes on.
 * The step back is recorded in level_upgrades like every other stage move.
 */
export async function syncApprovedSkills(
  svc: any,
  { studentId, skillIds, stageBack }: {
    studentId: string
    skillIds: string[]
    stageBack?: { adminId: string; notes?: string }
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ids = [...new Set(skillIds.filter(Boolean))]
  if (!studentId || ids.length === 0) return { ok: true }

  const { data: approved, error: histErr } = await svc
    .from('progress_history')
    .select('snapshot, coach_id, session_date, created_at')
    .eq('student_id', studentId)
    .eq('status', 'approved')
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (histErr) return { ok: false, error: histErr.message }

  const latest: Record<string, { pct: number; coachId: string | null }> = {}
  for (const row of approved || []) {
    const snap = (row.snapshot || {}) as Record<string, unknown>
    for (const id of ids) {
      if (id in latest || !(id in snap)) continue
      const n = Number(snap[id])
      if (Number.isFinite(n) && n >= 0 && n <= 100) latest[id] = { pct: n, coachId: row.coach_id ?? null }
    }
  }
  const toWrite = Object.keys(latest)
  if (toWrite.length === 0) return { ok: true }

  // What the live table held before, and where the swimmer sits, for stageBack.
  let before: Record<string, number> = {}
  let student: { current_level: any; current_stage: any } | null = null
  if (stageBack) {
    const [{ data: s }, { data: rows }] = await Promise.all([
      svc.from('students').select('current_level, current_stage').eq('id', studentId).single(),
      svc.from('student_skill_progress').select('skill_id, progress_percent')
        .eq('student_id', studentId).in('skill_id', toWrite),
    ])
    student = s || null
    before = Object.fromEntries((rows || []).map((r: any) => [r.skill_id, Number(r.progress_percent) || 0]))
  }

  // last_updated_by is an FK to coaches: the coach of the report the value
  // came from. Who confirmed or edited it is on the history row.
  const now = new Date().toISOString()
  const { error: upsertErr } = await svc.from('student_skill_progress').upsert(
    toWrite.map(skill_id => ({
      student_id: studentId,
      skill_id,
      progress_percent: latest[skill_id].pct,
      last_updated_by: latest[skill_id].coachId,
      last_updated_at: now,
    })),
    { onConflict: 'student_id,skill_id' },
  )
  if (upsertErr) return { ok: false, error: upsertErr.message }

  if (!stageBack || !student?.current_level) return { ok: true }
  const curStage = Number(student.current_stage) || 1
  if (curStage <= 1) return { ok: true }

  const { data: lvl } = await svc
    .from('levels').select('id').eq('level_number', student.current_level).maybeSingle()
  if (!lvl) return { ok: true }
  // Active skills only, as the trigger counts them.
  const { data: levelSkills } = await svc
    .from('skills').select('id, stage').eq('level_id', lvl.id).eq('is_active', true)
  const stageOf: Record<string, number> = {}
  for (const k of levelSkills || []) stageOf[k.id] = Number(k.stage) || 1

  const dropped = toWrite.some(id =>
    stageOf[id] !== undefined && stageOf[id] < curStage
    && (before[id] ?? 0) >= UNLOCK_VALUE && latest[id].pct < UNLOCK_VALUE)
  if (!dropped) return { ok: true }

  const { data: live } = await svc
    .from('student_skill_progress').select('skill_id, progress_percent')
    .eq('student_id', studentId).in('skill_id', Object.keys(stageOf))
  const liveOf: Record<string, number> = {}
  for (const r of live || []) liveOf[r.skill_id] = Number(r.progress_percent) || 0
  let target = curStage
  for (let st = 1; st < curStage; st++) {
    const inStage = Object.keys(stageOf).filter(id => stageOf[id] === st)
    if (inStage.length > 0 && inStage.some(id => (liveOf[id] ?? 0) < UNLOCK_VALUE)) { target = st; break }
  }
  if (target >= curStage) return { ok: true }

  // History row first, then the student, as setStudentLevel does: a failure
  // cannot leave a swimmer moved with no record.
  const { data: record, error: recErr } = await svc.from('level_upgrades').insert({
    student_id: studentId,
    from_level: student.current_level,
    to_level: student.current_level,
    from_stage: curStage,
    to_stage: target,
    upgraded_by: stageBack.adminId,
    notes: stageBack.notes || 'Stage returned: a skill was lowered in a report edit',
  }).select('id').single()
  if (recErr || !record) return { ok: false, error: recErr?.message || 'Could not record the stage change' }
  // Conditional on the stage we read, so a promotion that landed in between
  // is not undone by this.
  const { data: moved, error: moveErr } = await svc.from('students')
    .update({ current_stage: target })
    .eq('id', studentId).eq('current_stage', curStage)
    .select('id')
  if (moveErr || !moved || moved.length === 0) {
    await svc.from('level_upgrades').delete().eq('id', record.id)
    if (moveErr) return { ok: false, error: moveErr.message }
  }
  return { ok: true }
}

/**
 * The scores a swimmer's reports are still waiting on, for the coach's own
 * screens: every pending report newer than the swimmer's newest approved one,
 * oldest first, so the latest pending value of each skill wins. Laid over the
 * live table, it is the picture the coach last sent -- what the live table
 * itself used to show before it waited for the admin.
 */
export async function pendingOverlay(svc: any, studentId: string, asOfDate?: string | null): Promise<Snapshot> {
  let q = svc
    .from('progress_history')
    .select('snapshot, status, session_date, created_at')
    .eq('student_id', studentId)
    .in('status', ['pending_review', 'approved'])
  // asOfDate: only reports for lessons on or before that day. A record for a
  // lesson in between must carry what the coach had already reported by then,
  // and nothing reported for later lessons (found 2026-10-06).
  if (asOfDate) q = q.lte('session_date', asOfDate)
  const { data: rows } = await q
    .order('session_date', { ascending: true })
    .order('created_at', { ascending: true })
  return overlayFromRows(rows || [])
}

/** pendingOverlay over rows already read (same order: lesson date, then
 *  created). Used where one query serves many swimmers. */
export function overlayFromRows(rows: any[]): Snapshot {
  const list = rows || []
  let lastApproved = -1
  list.forEach((r: any, i: number) => { if (r.status === 'approved') lastApproved = i })
  const out: Snapshot = {}
  for (const r of list.slice(lastApproved + 1)) {
    if (r.status !== 'pending_review') continue
    for (const [id, v] of Object.entries((r.snapshot || {}) as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n) && n >= 0 && n <= 100) out[id] = n
    }
  }
  return out
}
