// One place for the model that writes and translates family-facing text, so the
// two routes that use it cannot drift apart.
export const POLISH_MODEL = 'claude-sonnet-4-6'

// Languages a note can be shown in. Only ones somebody on staff can read are
// listed: a family must never be sent text nobody could check.
export const SUPPORTED_NOTE_LANGUAGES = ['en', 'zh'] as const

export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  zh: 'Traditional Chinese (繁體中文)',
}
