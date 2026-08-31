import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site-config'
import { LOCALES, DEFAULT_LOCALE } from '@/lib/i18n'
import { LEGAL_VERSIONS } from '@/lib/legal'

// The public map of this site for search engines.
//
// It is generated rather than typed out so it cannot fall behind: paths that
// exist in three languages are listed once per language with the hreflang
// alternates filled in, exactly the rule lib/marketing-metadata.ts uses for
// canonicals. English sits at the bare path, the two Chinese locales under a
// segment.
//
// This does nothing while app/robots.ts has SEARCH_ENGINES_ALLOWED = false --
// crawlers are told to stay away and the root layout sends noindex. It is here
// so that flipping that switch is the only thing go-live needs.
//
// Deliberately absent: /login, /register, /dashboard, /booking, /checkout,
// /admin, /coach. They are either behind a login or a step in a flow; a search
// result landing on them helps nobody.

/** Marketing pages, in the three languages. Keep in step with LOCALISED_PATHS
 *  in lib/i18n/paths.ts -- that set decides which prefixed URLs actually
 *  resolve, and a sitemap entry for one that does not is a 404 we advertised. */
const LOCALISED = ['', '/assessment', '/levels', '/plans', '/about', '/faq'] as const

/** English-only pages. The legal documents stay in English by decision, and
 *  careers is the one page that is indexed even before launch. */
const ENGLISH_ONLY: { path: string; lastModified?: string }[] = [
  { path: '/careers' },
  { path: '/policies' },
  { path: '/terms', lastModified: LEGAL_VERSIONS.terms },
  { path: '/privacy-policy' },
  { path: '/waiver', lastModified: LEGAL_VERSIONS.waiver },
  { path: '/media-release', lastModified: LEGAL_VERSIONS.media },
  { path: '/sms-terms' },
]

const url = (locale: string, path: string) =>
  SITE_URL + (locale === DEFAULT_LOCALE ? '' : '/' + locale) + path

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const entries: MetadataRoute.Sitemap = []

  for (const path of LOCALISED) {
    const languages: Record<string, string> = {}
    for (const l of LOCALES) languages[l] = url(l, path)
    languages['x-default'] = url(DEFAULT_LOCALE, path)
    for (const l of LOCALES) {
      entries.push({
        url: url(l, path),
        lastModified: now,
        changeFrequency: 'monthly',
        // The home page and the two pages a family reads before deciding.
        priority: path === '' ? 1 : path === '/plans' || path === '/assessment' ? 0.9 : 0.7,
        alternates: { languages },
      })
    }
  }

  for (const { path, lastModified } of ENGLISH_ONLY) {
    entries.push({
      url: SITE_URL + path,
      lastModified: lastModified ? new Date(lastModified) : now,
      changeFrequency: 'yearly',
      priority: path === '/careers' ? 0.6 : 0.3,
    })
  }

  return entries
}
