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
