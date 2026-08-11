import { POLISH_MODEL, SUPPORTED_NOTE_LANGUAGES, LANGUAGE_NAMES } from './models'

// Rewrites a note's stored translations from its CURRENT approved text. Called
// both when a report is published and when a published one is corrected, so an
// edit never leaves the other language showing the old wording.
// Never throws: a family sees the original note when a translation is missing,
// which is a far better outcome than a failed publish or a failed correction.
export async function refreshNoteTranslations(supabase: any, noteId: string) {
  try {
    const { data: noteRow } = await supabase
      .from('lesson_notes').select('language, note').eq('id', noteId).single()
    const source = String(noteRow?.note || '').trim()
    const sourceLang = noteRow?.language || 'en'
    const targets = SUPPORTED_NOTE_LANGUAGES.filter(l => l !== sourceLang)
    if (!source || targets.length === 0) return

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
          .upsert({ lesson_note_id: noteId, language: target, text }, { onConflict: 'lesson_note_id,language' })
      }
    }
  } catch (err) {
    console.error('refreshNoteTranslations failed', err)
  }
}
