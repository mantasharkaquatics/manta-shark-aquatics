import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { refreshNoteTranslations } from '@/lib/ai/translate-note'
import { readJson, badRequest } from '@/lib/http'
import { cleanSnapshot, syncApprovedSkills } from '@/lib/skill-progress-sync'

/**
 * Confirms a lesson report: the skill scores and the note, as one card.
 *
 * This is where a coach's scores reach the live skill table (and through its
 * trigger, the swimmer's stage). The coach's route only queues them, because
 * nothing the family sees may move before an admin confirms it (owner,
 * 2026-10-05).
 *
 * Order matters, because PostgREST gives us no transaction:
 *  1. read and check; the scores are cleaned to real skills and 0-100;
 *  2. CLAIM the report (the conditional move off pending_review), so of two
 *     confirms arriving together only one goes on -- the other used to write
 *     its own edits into the live table and only then lose (found 2026-10-05);
 *  3. the scores go live, then the note is approved. A failure here puts the
 *     report back to pending, so the card returns to Reviews and can be
 *     confirmed again; both steps are safe to repeat.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  // student_id in the body is ignored: the report says whose it is.
  const { history_id, updated_snapshot, note_id, note_text } = body
  const admin_id = auth.admin.id
  const supabase = auth.svc
  if (!history_id) return NextResponse.json({ error: 'Missing fields', code: 'missing_fields' }, { status: 400 })

  const { data: histRow } = await supabase
    .from('progress_history').select('coach_id, student_id, snapshot, status, lesson_key').eq('id', history_id).single()
  if (!histRow) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
  // A stale tab could re-approve an approved record, or approve one another
  // admin had rejected, rewriting the live skill progress (found 2026-10-04).
  if (histRow.status !== 'pending_review') {
    return NextResponse.json({ error: 'This progress record has already been reviewed', code: 'already_reviewed' }, { status: 409 })
  }

  // A swimmer with no level is an assessment, and that is confirmed together
  // with its level (/api/admin/review-assessment). Publishing it here would put
  // a note in front of the family with no level behind it.
  const { data: who } = await supabase
    .from('students').select('current_level').eq('id', histRow.student_id).single()
  if (!who?.current_level) {
    return NextResponse.json({ error: 'This is an assessment with no level yet. Confirm it together with its level.', code: 'assessment_no_level' }, { status: 409 })
  }

  if (note_id) {
    const { data: n } = await supabase.from('lesson_notes').select('student_id, lesson_key').eq('id', note_id).single()
    if (!n || n.student_id !== histRow.student_id || (histRow.lesson_key && n.lesson_key !== histRow.lesson_key)) {
      return NextResponse.json({ error: 'That note belongs to another lesson', code: 'mismatch' }, { status: 400 })
    }
  }

  // Only the skills that were changed may come back; the rest of the record
  // stays. Real skill ids with values 0-100 only (found 2026-10-05).
  const edited = updated_snapshot && typeof updated_snapshot === 'object' && !Array.isArray(updated_snapshot)
  const snapshot = await cleanSnapshot(supabase,
    edited ? { ...(histRow.snapshot || {}), ...updated_snapshot } : (histRow.snapshot || {}))

  // 2. The claim. Only the call that moves it off pending_review goes on.
  const claimAt = new Date().toISOString()
  const { data: approved, error } = await supabase
    .from('progress_history')
    .update({ status: 'approved', reviewed_by: admin_id, reviewed_at: claimAt, snapshot })
    .eq('id', history_id)
    .eq('status', 'pending_review')
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!approved || approved.length === 0) {
    return NextResponse.json({ error: 'This progress record has already been reviewed', code: 'already_reviewed' }, { status: 409 })
  }
  // Puts the card back in Reviews. The original snapshot goes back with it, so
  // a retry starts from what the coach sent, as the admin's screen still shows.
  const fail = async (message: string) => {
    await supabase.from('progress_history')
      .update({ status: 'pending_review', reviewed_by: null, reviewed_at: null, snapshot: histRow.snapshot })
      .eq('id', history_id).eq('status', 'approved').eq('reviewed_at', claimAt)
    // And the live table back to the approved picture, best effort.
    await syncApprovedSkills(supabase, { studentId: histRow.student_id, skillIds: Object.keys(snapshot) })
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // 3. The scores go live, from the approved reports, the newest lesson
  // winning per skill (see syncApprovedSkills).
  const synced = await syncApprovedSkills(supabase, {
    studentId: histRow.student_id,
    skillIds: Object.keys(snapshot),
  })
  if (!synced.ok) return fail(synced.error)

  // The lesson note is approved in the same breath. The transcript is never
  // touched: editing changes only what the family reads.
  if (note_id) {
    const { error: noteError } = await supabase
      .from('lesson_notes')
      .update({
        note: String(note_text ?? '').trim(),
        status: 'approved',
        reviewed_by: admin_id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', note_id)
    if (noteError) return fail(noteError.message)

    await refreshNoteTranslations(supabase, note_id)
  }

  return NextResponse.json({ ok: true })
}
