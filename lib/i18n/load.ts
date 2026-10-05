/* Fetch a language's text in the browser when nobody handed it over
   (see lib/i18n/index.ts). Each file becomes its own download, fetched once
   and then cached by the browser like any other script. */
import { isDictLoaded, registerDict, type Dict, type Locale } from './index'

const SITE: Partial<Record<Locale, () => Promise<{ default: unknown }>>> = {
  'zh-Hant': () => import('./locales/zh-Hant.json'),
  'zh-Hans': () => import('./locales/zh-Hans.json'),
}
const STAFF: Record<Locale, () => Promise<{ default: unknown }>> = {
  en: () => import('./locales/staff/en.json'),
  'zh-Hant': () => import('./locales/staff/zh-Hant.json'),
  'zh-Hans': () => import('./locales/staff/zh-Hans.json'),
}

const pending = new Map<string, Promise<void>>()

function part(locale: Locale, which: 'site' | 'staff'): Promise<void> {
  if (isDictLoaded(locale) && which === 'site') return Promise.resolve()
  const key = which + ':' + locale
  let p = pending.get(key)
  if (!p) {
    const load = which === 'site' ? SITE[locale] : STAFF[locale]
    if (!load) return Promise.resolve()
    p = load().then(m => registerDict(locale, m.default as Dict, [which]))
    // A failed download (offline, a deploy replaced the file) must not stick:
    // the next attempt tries again, and until then English shows.
    p.catch(() => pending.delete(key))
    pending.set(key, p)
  }
  return p
}

/** Resolves once `locale` (and its staff text, if asked) can be shown. */
export function loadDict(locale: Locale, staff = false): Promise<void> {
  if (isDictLoaded(locale, staff)) return Promise.resolve()
  return Promise.all([part(locale, 'site'), staff ? part(locale, 'staff') : null]).then(() => {})
}
