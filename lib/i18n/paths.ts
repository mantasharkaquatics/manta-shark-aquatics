import { DEFAULT_LOCALE, type Locale } from './index'

// Paths that exist under app/[locale]. Everything else — /policies, /login,
// /register, /dashboard, the legal pages — has no localised route, and
// dynamicParams = false means a prefixed URL for them would 404.
const LOCALISED_PATHS = new Set(['/', '/assessment', '/levels', '/programs', '/programs/private', '/programs/group', '/programs/team', '/adaptive-swim', '/plans', '/about', '/faq'])

// Localised pages with an id in the path: one page per pool (/locations/brea).
// Which ids exist is the locations table's business, not this file's.
const LOCALISED_PREFIXES = ['/locations/']

const isLocalised = (path: string) =>
  LOCALISED_PATHS.has(path) || LOCALISED_PREFIXES.some(p => path.startsWith(p) && path.length > p.length)

/** Prefix a marketing path with the active locale; leave everything else alone. */
export function localePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE || !isLocalised(path)) return path
  return path === '/' ? '/' + locale : '/' + locale + path
}
