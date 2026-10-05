import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { refreshNoteTranslations } from '@/lib/ai/translate-note'
import { readJson, badRequest } from '@/lib/http'
import { cleanSnapshot, syncApprovedSkills } from '@/lib/skill-progress-sync'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const { history_id, note_id, student_id, lesson_key, note_text, snapshot } = body
  const admin_id = auth.admin.id
  const supabase = auth.svc

  if (!history_id || !student_id || !lesson_key) {
    return NextResponse.json({ error: 'history_id, student_id and lesson_key are required' }, { status: 400 })
  }

  // The previous values are captured before anything is written, so the trace
  // records what the family actually saw rather than what it is becoming.
  const { data: prevHistory } = await supabase
    .from('progress_history').select('snapshot, coach_id, student_id').eq('id', history_id).single()
  let prevNote: string | null = null
  if (note_id) {
    const { data: n } = await supabase.from('lesson_notes').select('note').eq('id', note_id).single()
    prevNote = n?.note ?? null
  }

  const { error: traceError } = await supabase.from('report_edits').insert({
    student_id,
    lesson_key,
    prev_note: prevNote,
    prev_snapshot: prevHistory?.snapshot ?? null,
    edited_by: admin_id,
  })
  if (traceError) return NextResponse.json({ error: traceError.message }, { status: 500 })

  // Real skill ids with values 0-100 only, as every other write of a snapshot.
  const cleaned = snapshot ? await cleanSnapshot(supabase, snapshot) : null
  if (cleaned) {
    const { error } = await supabase.from('progress_history').update({ snapshot: cleaned }).eq('id', history_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The transcript is never touched: an edit changes only what the family reads.
  if (note_id) {
    const { error } = await supabase.from('lesson_notes')
      .update({ note: String(note_text ?? '').trim(), updated_at: new Date().toISOString() })
      .eq('id', note_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  
    // The correction has to reach the other language too, or a family reading it
    // keeps seeing the wording that was just fixed.
    await refreshNoteTranslations(supabase, note_id)
  }

  // student_skill_progress holds the LATEST value per skill, so each skill this
  // report scores is rebuilt from the newest approved lesson that scored it --
  // never simply from the row that happened to be edited, which may be months
  // old. The stage follows: a skill lowered in a stage the swimmer has already
  // passed puts them back in that stage (the trigger only ever moves forward).
  if (cleaned) {
    const synced = await syncApprovedSkills(supabase, {
      // The report says whose it is; the body's student_id is only a fallback.
      studentId: prevHistory?.student_id || student_id,
      skillIds: [...Object.keys(prevHistory?.snapshot || {}), ...Object.keys(cleaned)],
      stageBack: { adminId: admin_id },
    })
    if (!synced.ok) return NextResponse.json({ error: synced.error }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
