import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { refreshNoteTranslations } from '@/lib/ai/translate-note'
import { readJson, badRequest } from '@/lib/http'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { history_id, student_id, updated_snapshot, note_id, note_text } = body
  const admin_id = auth.admin.id
  const supabase = auth.svc

  // student_skill_progress.last_updated_by is a FK to coaches, so the lesson's
  // coach belongs there, not the admin. Who reviewed is recorded on the history row.
  const { data: histRow } = await supabase
    .from('progress_history').select('coach_id').eq('id', history_id).single()

  // If the admin edited percentages before confirming, sync them into the student's actual skill progress first
  if (updated_snapshot && student_id) {
    const upserts = Object.entries(updated_snapshot).map(([skill_id, pct]) => ({
      student_id,
      skill_id,
      progress_percent: pct as number,
      last_updated_by: histRow?.coach_id ?? null,
      last_updated_at: new Date().toISOString()
    }))
    const { error: upsertError } = await supabase
      .from('student_skill_progress')
      .upsert(upserts, { onConflict: 'student_id,skill_id' })
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  const updatePayload: any = {
    status: 'approved',
    reviewed_by: admin_id,
    reviewed_at: new Date().toISOString()
  }
  if (updated_snapshot) updatePayload.snapshot = updated_snapshot

  const { error } = await supabase
    .from('progress_history')
    .update(updatePayload)
    .eq('id', history_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
    if (noteError) return NextResponse.json({ error: noteError.message }, { status: 500 })

    await refreshNoteTranslations(supabase, note_id)
  }

  return NextResponse.json({ ok: true })
}
