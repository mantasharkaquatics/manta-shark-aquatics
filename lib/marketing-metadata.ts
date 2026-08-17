import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site-config'
import { LOCALES, DEFAULT_LOCALE, translate, type Locale } from '@/lib/i18n'

// One source for every marketing page's <title>, <meta description>, canonical
// and hreflang set. English lives at the bare path; the two Chinese locales sit
// under a segment, so the alternates map is built from that rule rather than
// hard-coded per page.
export function marketingMetadata(slug: string, path: string, locale: Locale = DEFAULT_LOCALE): Metadata {
  const url = (l: Locale) => SITE_URL + (l === DEFAULT_LOCALE ? '' : '/' + l) + path
  const languages: Record<string, string> = {}
  for (const l of LOCALES) languages[l] = url(l)
  languages['x-default'] = url(DEFAULT_LOCALE)
  return {
    title: translate(locale, 'meta.' + slug + '.title'),
    description: translate(locale, 'meta.' + slug + '.description'),
    alternates: { canonical: url(locale), languages },
  }
}
