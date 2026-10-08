import { POLISH_MODEL, SUPPORTED_NOTE_LANGUAGES, LANGUAGE_NAMES, detectNoteLanguage } from './models'
import { FINAL_TAG_INSTRUCTION, finalText } from './final-text'
import { levelSkills, skillPairsFor, type SkillRef } from './skill-names'

// Rewrites a note's stored translations from its CURRENT approved text. Called
// both when a report is published and when a published one is corrected, so an
// edit never leaves the other language showing the old wording.
// Never throws: a family sees the original note when a translation is missing,
// which is a far better outcome than a failed publish or a failed correction.
//
// Returns the languages it could not produce, so a caller that cares (the
// admin repair button) can say so. The publish routes ignore it: a note that
// failed here shows up in the Reviews page's "missing a translation" count.
export async function refreshNoteTranslations(supabase: any, noteId: string): Promise<{ failed: string[] }> {
  const failed: string[] = []
  try {
    const { data: noteRow } = await supabase
      .from('lesson_notes').select('language, note, student_id').eq('id', noteId).single()
    const source = String(noteRow?.note || '').trim()
    if (!source) return { failed }

    /* The stored language was read off the coach's TRANSCRIPT. The admin may
       then rewrite the note in the other language before approving it -- that
       is how a note labelled zh-Hant came to read "Today CC's streamline
       performance was very good." A family reading in Chinese was handed the
       English as "the original", because a note is only looked up in
       translation when its label differs from the reader's language. So the
       label is re-read from the text actually approved. zh-Hans survives:
       the detector cannot tell the two scripts apart and only ever says
       zh-Hant, so a note already marked Simplified keeps that mark while it
       still reads as Chinese. */
    const stored = noteRow?.language || 'en'
    const detected = detectNoteLanguage(source, stored)
    const sourceLang = detected === 'zh-Hant' && stored === 'zh-Hans' ? 'zh-Hans' : detected
    if (sourceLang !== stored) {
      await supabase.from('lesson_notes').update({ language: sourceLang }).eq('id', noteId)
    }
    // A translation INTO the note's own language is left over from the old
    // label and would never be read again; drop it so the table stays honest.
    await supabase.from('lesson_note_translations')
      .delete().eq('lesson_note_id', noteId).eq('language', sourceLang)

    const targets = SUPPORTED_NOTE_LANGUAGES.filter(l => l !== sourceLang)
    if (targets.length === 0) return { failed }

    const glossary = await loadGlossary(supabase)
    const skills = await levelSkills(supabase, { studentId: noteRow?.student_id }).catch(() => [] as SkillRef[])

    for (const target of targets) {
      const names = skills.length ? skillPairsFor(sourceLang, target, skills) : undefined
      const text = await translateOnce(source, target, glossary, names)
        ?? await translateOnce(source, target, glossary, names)   // one retry: a busy API is the usual cause
      if (!text) { failed.push(target); continue }
      const { error } = await supabase.from('lesson_note_translations')
        .upsert({ lesson_note_id: noteId, language: target, text }, { onConflict: 'lesson_note_id,language' })
      if (error) { console.error('note translation save failed', noteId, target, error.message); failed.push(target) }
    }
  } catch (err) {
    console.error('refreshNoteTranslations failed', noteId, err)
    return { failed: ['*'] }
  }
  if (failed.length) console.error('note translation missing', noteId, failed.join(','))
  return { failed }
}

/** The swim terms that stay in English in every language. */
export async function loadGlossary(supabase: any): Promise<string[]> {
  const { data } = await supabase
    .from('note_glossary').select('term').eq('is_active', true).order('term')
  return (data || []).map((g: any) => g.term)
}

/** One call to the model. Null on any failure, with the reason logged: an
 *  error response used to come back as an empty text and be skipped silently.
 *  Also used for the one-line course recommendation on an assessment report. */
export async function translateOnce(source: string, target: string, glossary: string[], skillNames?: string): Promise<string | null> {
  try {
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
          + (skillNames
            ? `These are skills of the swim curriculum and have fixed names. Translate each exactly as shown; this list wins over the English-terms list above:\n${skillNames}\n`
            : '')
          + `Say only what the note says. Add nothing, drop nothing.\n`
          + FINAL_TAG_INSTRUCTION,
        messages: [{ role: 'user', content: source }],
      }),
    })
    if (!res.ok) {
      console.error('note translation API error', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const json = await res.json()
    const text = finalText((json?.content || []).map((c: any) => c.text || '').join(''))
    if (!text) console.error('note translation refused: no clean <final> text')
    return text
  } catch (err) {
    console.error('note translation request failed', err)
    return null
  }
}
