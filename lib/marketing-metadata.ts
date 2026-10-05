import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site-config'
import { LOCALES, DEFAULT_LOCALE, translate, type Locale } from '@/lib/i18n/all'
import { SITE_OG_IMAGE } from '@/lib/og'

// og:locale wants language_TERRITORY. Same territories as dateTag().
const OG_LOCALE: Record<Locale, string> = { en: 'en_US', 'zh-Hant': 'zh_TW', 'zh-Hans': 'zh_CN' }

// One source for every marketing page's <title>, <meta description>, canonical
// and hreflang set. English lives at the bare path; the two Chinese locales sit
// under a segment, so the alternates map is built from that rule rather than
// hard-coded per page.
export function marketingMetadata(slug: string, path: string, locale: Locale = DEFAULT_LOCALE): Metadata {
  const url = (l: Locale) => SITE_URL + (l === DEFAULT_LOCALE ? '' : '/' + l) + path
  const languages: Record<string, string> = {}
  for (const l of LOCALES) languages[l] = url(l)
  languages['x-default'] = url(DEFAULT_LOCALE)
  const title = translate(locale, 'meta.' + slug + '.title')
  const description = translate(locale, 'meta.' + slug + '.description')
  return {
    title,
    description,
    alternates: { canonical: url(locale), languages },
    // Found 2026-10-05: with no openGraph/twitter here, every page inherited
    // the root layout's -- a shared /zh-Hant/plans link previewed as the
    // English home page. Metadata merges shallowly, so this object replaces
    // the root's whole openGraph and has to name everything (type, site name,
    // image), not only what differs.
    openGraph: {
      type: 'website', siteName: 'Manta Shark Aquatics',
      title, description, url: url(locale),
      locale: OG_LOCALE[locale],
      alternateLocale: LOCALES.filter(l => l !== locale).map(l => OG_LOCALE[l]),
      images: [SITE_OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [SITE_OG_IMAGE.url] },
  }
}
