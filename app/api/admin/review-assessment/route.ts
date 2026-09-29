import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { refreshNoteTranslations } from '@/lib/ai/translate-note'
import { readJson, badRequest } from '@/lib/http'
import { isLevelNumber } from '@/lib/levels'
import { setStudentLevel } from '@/lib/level-change'

/**
 * Confirms a swimmer's assessment: the level, the skill scores and the lesson
 * note, in one step. Reviews shows them as one card for the same reason the
 * ordinary lesson report pairs its note with its scores -- a family must never
 * read a note whose level is still undecided.
 *
 * Order matters, because PostgREST gives us no transaction:
 *  1. everything is read and checked first, so a bad request writes nothing;
 *  2. the level moves (history row first, see setStudentLevel);
 *  3. the scores go live, then the note, then the recommendation is closed;
 *  4. the report itself is approved LAST. Reviews lists the card for as long
 *     as the report is pending, so any failure before this point leaves the
 *     card on screen to confirm again -- and a retry is safe: step 2 is skipped
 *     when the swimmer is already at the chosen level, the rest are updates.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { history_id, recommendation_id, final_level, updated_snapshot, note_id, note_text } = body
  const adminId = auth.admin.id
  const svc = auth.svc
  if (!history_id || !recommendation_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (!isLevelNumber(final_level)) return NextResponse.json({ error: 'That level does not exist' }, { status: 400 })
  const level = Number(final_level)

  const [{ data: rec }, { data: hist }] = await Promise.all([
    svc.from('level_recommendations').select('id, student_id, recommended_level, status').eq('id', recommendation_id).single(),
    svc.from('progress_history').select('id, student_id, coach_id, snapshot, status, lesson_key').eq('id', history_id).single(),
  ])
  if (!rec || !hist) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (rec.student_id !== hist.student_id) return NextResponse.json({ error: 'That level and that report are for different swimmers' }, { status: 400 })
  // The recommendation is closed last, so while it is pending the confirm has
  // not finished and may be run again, even if the report half already went.
  // The report is approved last, so while it is pending the confirm has not
  // finished and may run again -- even if the recommendation already closed.
  if (hist.status !== 'pending_review' || !['pending', 'approved', 'modified'].includes(rec.status)) {
    return NextResponse.json({ error: 'This assessment has already been confirmed' }, { status: 409 })
  }
  const { data: student } = await svc
    .from('students').select('id, current_level').eq('id', rec.student_id).single()
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  if (student.current_level && String(student.current_level) !== String(level)) {
    return NextResponse.json({ error: 'This swimmer already has a level. Change it on the Levels page instead.' }, { status: 409 })
  }

  let note: { id: string } | null = null
  if (note_id) {
    const { data } = await svc.from('lesson_notes').select('id, student_id, lesson_key').eq('id', note_id).single()
    if (!data || data.student_id !== hist.student_id || data.lesson_key !== hist.lesson_key) {
      return NextResponse.json({ error: 'That note belongs to another lesson' }, { status: 400 })
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

  // 2. The level.
  if (!student.current_level) {
    const moved = await setStudentLevel(svc, { studentId: rec.student_id, toLevel: level, adminId, notes: 'Assessment' })
    if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status })
  }

  // 3. The scores go live. After the level, so the stage trigger reads the
  // level the swimmer is now in. last_updated_by is an FK to coaches: the
  // lesson's coach goes there; who confirmed is on the history row.
  const now = new Date().toISOString()
  const upserts = Object.entries(snapshot).map(([skill_id, pct]) => ({
    student_id: rec.student_id,
    skill_id,
    progress_percent: Number(pct) || 0,
    last_updated_by: hist.coach_id ?? null,
    last_updated_at: now,
  }))
  if (upserts.length > 0) {
    const { error } = await svc.from('student_skill_progress').upsert(upserts, { onConflict: 'student_id,skill_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (note) {
    const { error: noteErr } = await svc.from('lesson_notes').update({
      note: String(note_text ?? '').trim(),
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: now,
      updated_at: now,
    }).eq('id', note.id)
    if (noteErr) return NextResponse.json({ error: noteErr.message }, { status: 500 })
    await refreshNoteTranslations(svc, note.id)
  }

  // 4. Close the recommendation (a retry finds it closed and leaves it).
  const { error: recErr } = rec.status !== 'pending' ? { error: null } : await svc.from('level_recommendations').update({
    status: level === Number(rec.recommended_level) ? 'approved' : 'modified',
    reviewed_by: adminId,
    final_level: level,
    reviewed_at: now,
  }).eq('id', recommendation_id)
  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 })

  // 5. The report, last: this is what takes the card out of Reviews.
  const { error: histErr } = await svc.from('progress_history').update({
    status: 'approved', reviewed_by: adminId, reviewed_at: now, snapshot,
  }).eq('id', history_id)
  if (histErr) return NextResponse.json({ error: histErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
