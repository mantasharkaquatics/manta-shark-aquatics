import { DEFAULT_LOCALE, type Locale } from './index'

// Paths that exist under app/[locale]. Everything else — /policies, /login,
// /register, /dashboard, the legal pages — has no localised route, and
// dynamicParams = false means a prefixed URL for them would 404.
const LOCALISED_PATHS = new Set(['/', '/levels', '/plans', '/about'])

/** Prefix a marketing path with the active locale; leave everything else alone. */
export function localePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE || !LOCALISED_PATHS.has(path)) return path
  return path === '/' ? '/' + locale : '/' + locale + path
}
