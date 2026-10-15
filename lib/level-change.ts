/* eslint-disable @typescript-eslint/no-explicit-any */
import { isLevelNumber } from './levels'
import { allRows, allRowsIn } from './db-paging'
import { getTodayLA, getNowMinutesLA } from './date'
import { tierFor, TEAM_SQUAD_CAP, type TierBand } from './team-tiers'
import { alertAdmin } from './admin-alert'

/** A booked 1-on-4 lesson whose class band no longer holds the swimmer's level. */
export type OutOfBandLesson = { booking_id: string; date: string; start_time: string; level_min: number; level_max: number }
/**
 * What a level change did to a Swim Team membership: moved to the squad the
 * new level belongs to, or kept where it was because no squad covers it (the
 * school is emailed). null = not on the team, or already in the right squad.
 */
export type SquadChange =
  | { status: 'moved'; from: string | null; to: string }
  | { status: 'no_squad'; from: string | null }
  | { status: 'failed'; from: string | null; to: string }

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
 *
 * After the move, two things that hang off the level (found 2026-10-15):
 *  - `outOfBand`: the swimmer's future 1-on-4 lessons in a class whose level
 *    band no longer holds the new level. They are NOT moved or cancelled --
 *    the swimmer finishes the term in the class already booked (owner,
 *    2026-10-15, option A) -- the desk is only told, so it is not news at
 *    renewal. The routes return it and the screen that made the change shows it.
 *  - `squad`: a Swim Team membership follows the level to the squad sign-up
 *    would pick for it (syncTeamSquad below), so check-in and the parent's
 *    practice times read the new squad.
 * Neither can undo the level change; a failure there is logged.
 */
export async function setStudentLevel(
  svc: any,
  { studentId, toLevel, adminId, notes }: { studentId: string; toLevel: number | string; adminId: string; notes?: string | null },
): Promise<{ ok: true; record: any; outOfBand: OutOfBandLesson[]; squad: SquadChange | null } | { ok: false; status: number; error: string }> {
  if (!studentId) return { ok: false, status: 400, error: 'Missing student' }
  if (!isLevelNumber(toLevel)) return { ok: false, status: 400, error: 'That level does not exist' }
  const to = String(Number(toLevel))

  const { data: student, error: readErr } = await svc
    .from('students').select('full_name, current_level, current_stage').eq('id', studentId).single()
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
  const [outOfBand, squad] = await Promise.all([
    outOfBandGroupLessons(svc, studentId, Number(to)).catch(e => {
      console.error('setStudentLevel: could not read the swimmer\'s group lessons:', e instanceof Error ? e.message : e)
      return [] as OutOfBandLesson[]
    }),
    syncTeamSquad(svc, { studentId, level: Number(to), studentName: student.full_name || null }).catch(e => {
      console.error('setStudentLevel: could not update the Swim Team squad:', e instanceof Error ? e.message : e)
      return null
    }),
  ])
  return { ok: true, record, outOfBand, squad }
}

/**
 * The swimmer's lessons still to come in a banded 1-on-4 class whose band does
 * not hold `level` (found 2026-10-15, F194). The band is the one stamped on the
 * session (class_sessions.level_min/max, written from the group zone when the
 * class opened); a session with no band admits every level and is left out.
 */
export async function outOfBandGroupLessons(svc: any, studentId: string, level: number): Promise<OutOfBandLesson[]> {
  const { data, error } = await allRows(() => svc.from('bookings')
    .select('id, status, session:class_sessions!bookings_class_session_id_fkey(session_date, start_time, status, level_min, level_max)')
    .eq('student_id', studentId).in('status', ['confirmed', 'pending_payment', 'in_cart']).order('id'))
  if (error) throw new Error(error.message || String(error))
  const today = getTodayLA(), nowMin = getNowMinutesLA()
  const toMin = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  const out: OutOfBandLesson[] = []
  for (const b of data as any[]) {
    const s = Array.isArray(b.session) ? b.session[0] : b.session
    if (!s || s.status === 'cancelled' || s.level_min == null || s.level_max == null) continue
    if (s.session_date < today || (s.session_date === today && toMin(s.start_time) < nowMin)) continue
    if (level >= Number(s.level_min) && level <= Number(s.level_max)) continue
    out.push({ booking_id: b.id, date: s.session_date, start_time: String(s.start_time).slice(0, 5), level_min: Number(s.level_min), level_max: Number(s.level_max) })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time))
}

/**
 * Puts a Swim Team member in the squad their level belongs to (found
 * 2026-10-15, F25). The squad was chosen once, at sign-up, and nothing moved
 * it: a swimmer promoted out of Junior was refused at the Intermediate
 * practice's check-in and shown Junior's times, and only SQL could fix it.
 *
 * The squad is picked as /api/stripe/checkout picks it -- tierFor over the
 * active squads, at the new level's stage 1 -- and written to the swimmer's
 * live memberships (active or past_due). Every squad costs the same, so the
 * Stripe subscription is not touched. When no squad covers the new level the
 * membership keeps its squad and the school is emailed to decide; a squad
 * already at its cap is still joined (the swimmer is a paying member already)
 * and the school is told that too.
 */
export async function syncTeamSquad(svc: any, { studentId, level, studentName }: { studentId: string; level: number; studentName: string | null }): Promise<SquadChange | null> {
  const { data: mems, error: memErr } = await svc.from('team_memberships')
    .select('id, team_tier_id').eq('student_id', studentId).in('status', ['active', 'past_due'])
  if (memErr) throw new Error(memErr.message)
  if (!mems || mems.length === 0) return null
  const { data: tiers, error: tierErr } = await svc.from('team_tiers')
    .select('id, name, active, level_min, level_max, min_stage, max_stage').order('level_min').order('min_stage')
  if (tierErr) throw new Error(tierErr.message)
  const nameOf = (id: string | null) => (tiers || []).find((t: any) => t.id === id)?.name ?? null
  const from = nameOf(mems[0].team_tier_id)
  const who = studentName || studentId
  const tier = tierFor<TierBand & { id: string; name: string }>((tiers || []).filter((t: any) => t.active), level, 1)
  if (!tier) {
    await alertAdmin(`Swim Team squad not changed: ${who}`, [
      `${who} moved to Level ${level}, and no active squad covers Level ${level} stage 1.`,
      `The membership stays in ${from || 'its old squad'}. Decide whether the swimmer stays on the team, moves to another squad, or the membership is cancelled.`,
    ])
    return { status: 'no_squad', from }
  }
  const moving = mems.filter((m: any) => m.team_tier_id !== tier.id)
  if (moving.length === 0) return null
  const { error: updErr } = await svc.from('team_memberships')
    .update({ team_tier_id: tier.id, updated_at: new Date().toISOString() })
    .in('id', moving.map((m: any) => m.id))
  if (updErr) {
    await alertAdmin(`Swim Team squad not changed: ${who}`, [
      `${who} moved to Level ${level}, which belongs in ${tier.name}, but the membership could not be moved there (${updErr.message}).`,
      `It is still in ${from || 'its old squad'}; check-in will refuse the swimmer at ${tier.name} practices until it is fixed.`,
    ])
    return { status: 'failed', from, to: tier.name }
  }
  const { count } = await svc.from('team_memberships').select('id', { count: 'exact', head: true })
    .eq('team_tier_id', tier.id).in('status', ['active', 'past_due'])
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
  if ((count || 0) > TEAM_SQUAD_CAP) {
    await alertAdmin(`${tier.name} is over its cap after a level change`, [
      `${who} moved to Level ${level} and from ${from || 'their old squad'} to ${tier.name}.`,
      `${tier.name} now has ${count} members (cap ${TEAM_SQUAD_CAP}).`,
    ])
  }
  return { status: 'moved', from, to: tier.name }
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
