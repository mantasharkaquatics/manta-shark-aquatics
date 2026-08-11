import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { history_id, note_id, student_id, lesson_key, note_text, snapshot } = await req.json()
  const admin_id = auth.admin.id
  const supabase = auth.svc

  if (!history_id || !student_id || !lesson_key) {
    return NextResponse.json({ error: 'history_id, student_id and lesson_key are required' }, { status: 400 })
  }

  // The previous values are captured before anything is written, so the trace
  // records what the family actually saw rather than what it is becoming.
  const { data: prevHistory } = await supabase
    .from('progress_history').select('snapshot, coach_id').eq('id', history_id).single()
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

  if (snapshot) {
    const { error } = await supabase.from('progress_history').update({ snapshot }).eq('id', history_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The transcript is never touched: an edit changes only what the family reads.
  if (note_id) {
    const { error } = await supabase.from('lesson_notes')
      .update({ note: String(note_text ?? '').trim(), updated_at: new Date().toISOString() })
      .eq('id', note_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // student_skill_progress holds the LATEST value per skill, so it is rebuilt
  // from this student's most recent approved lesson - never from the row that
  // happened to be edited, which may be months old.
  const { data: latest } = await supabase
    .from('progress_history')
    .select('snapshot')
    .eq('student_id', student_id)
    .eq('status', 'approved')
    .order('session_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (latest?.snapshot) {
    const upserts = Object.entries(latest.snapshot).map(([skill_id, pct]) => ({
      student_id,
      skill_id,
      progress_percent: pct as number,
      last_updated_by: prevHistory?.coach_id ?? null,
      last_updated_at: new Date().toISOString(),
    }))
    if (upserts.length > 0) {
      const { error } = await supabase
        .from('student_skill_progress')
        .upsert(upserts, { onConflict: 'student_id,skill_id' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}
