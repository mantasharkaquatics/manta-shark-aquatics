// One place for the model that writes and translates family-facing text, so the
// routes that use it cannot drift apart.
export const POLISH_MODEL = 'claude-sonnet-4-6'

// Languages a note can be shown in. Only ones somebody on staff can read are
// listed: a family must never be sent text nobody could check. Traditional and
// Simplified are separate entries on purpose - the vocabulary genuinely differs
// and converting one into the other reads wrong to the other audience.
export const SUPPORTED_NOTE_LANGUAGES = ['en', 'zh-Hant', 'zh-Hans'] as const

// The language a coach can speak into the recorder.
export const RECORDING_LANGUAGES = ['en', 'zh-Hant'] as const

// Native-script names, used INSIDE PROMPTS where the model needs to be told
// exactly what to produce.
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  'zh-Hant': 'Traditional Chinese (繁體中文), as written in Taiwan',
  'zh-Hans': 'Simplified Chinese (简体中文), as written in mainland China',
  es: 'Spanish',
  ko: 'Korean',
  ja: 'Japanese',
}

// English-only names for the interface, so no screen has to import CJK.
export const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  'zh-Hant': 'Chinese (Traditional)',
  'zh-Hans': 'Chinese (Simplified)',
  es: 'Spanish',
  ko: 'Korean',
  ja: 'Japanese',
}

/**
 * Which language a recording turned out to be in, read from the words the
 * transcriber returned rather than from anything the coach set beforehand.
 *
 * The transcription call has never been told a language -- it detects one on
 * its own -- so a toggle in the recorder could only ever decide what language
 * the POLISHED note was written in. That let the two drift: a coach speaking
 * Chinese with the toggle left on English produced an English note against
 * Chinese audio, and the admin's whole check is reading the note WHILE hearing
 * the recording. Deciding from the transcript keeps them in step by
 * construction, and the coach no longer has to remember anything.
 *
 * Counting script rather than asking a model keeps this free, instant and
 * predictable. Ideographs are weighted because a Chinese note deliberately
 * keeps its English swim terms -- "streamline" is in the glossary for exactly
 * that reason -- and a handful of Latin words must not outvote the Chinese
 * carrying the sentence.
 */
export function detectNoteLanguage(
  transcript: string,
  fallback: string = 'en',
): string {
  const cjk = (transcript.match(/[㐀-䶿一-鿿]/g) || []).length
  const latin = (transcript.match(/[A-Za-z]/g) || []).length
  if (cjk === 0 && latin === 0) return fallback   // nothing to judge on
  return cjk * 3 >= latin ? 'zh-Hant' : 'en'
}
