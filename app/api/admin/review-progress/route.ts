import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { POLISH_MODEL, SUPPORTED_NOTE_LANGUAGES, LANGUAGE_NAMES } from '@/lib/ai/models'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { history_id, student_id, updated_snapshot, note_id, note_text } = await req.json()
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

    // Families who read the other language get a translation of the text the
    // admin just approved - never of unreviewed output. Deliberately non-fatal:
    // display falls back to the original note, whereas throwing here would stop
    // a lesson report being published over a secondary feature.
    try {
      const { data: noteRow } = await supabase
        .from('lesson_notes').select('language, note').eq('id', note_id).single()
      const source = String(noteRow?.note || '').trim()
      const sourceLang = noteRow?.language || 'en'
      const targets = SUPPORTED_NOTE_LANGUAGES.filter(l => l !== sourceLang)
      if (source && targets.length > 0) {
        const { data: glossaryRows } = await supabase
          .from('note_glossary').select('term').eq('is_active', true).order('term')
        const glossary = (glossaryRows || []).map((g: any) => g.term)
        for (const target of targets) {
          const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': process.env.ANTHROPIC_API_KEY!,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model: POLISH_MODEL,
              max_tokens: 700,
              system:
                `Translate a swim lesson note for the swimmer's family into ${LANGUAGE_NAMES[target]}.\n`
                + `Keep these terms in English exactly as written, never translated: ${glossary.join(', ')}.\n`
                + `Say only what the note says. Add nothing, drop nothing.\n`
                + `Return the translated note alone, with no preamble.`,
              messages: [{ role: 'user', content: source }],
            }),
          })
          const json = await res.json()
          const text = (json?.content || []).map((c: any) => c.text || '').join('').trim()
          if (text) {
            await supabase.from('lesson_note_translations')
              .upsert({ lesson_note_id: note_id, language: target, text }, { onConflict: 'lesson_note_id,language' })
          }
        }
      }
    } catch (err) {
      console.error('review-progress: translation failed', err)
    }
  }

  return NextResponse.json({ ok: true })
}
