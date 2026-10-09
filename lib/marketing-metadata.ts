import type { Metadata } from 'next'
import { SITE_URL } from '@/lib/site-config'
import { LOCALES, DEFAULT_LOCALE, translate, type Locale } from '@/lib/i18n/all'
import { SITE_OG_IMAGE } from '@/lib/og'
import { HOME_PLACE, placeName } from '@/lib/location-place'
import { publicLocations } from '@/lib/public-locations'

// og:locale wants language_TERRITORY. Same territories as dateTag().
const OG_LOCALE: Record<Locale, string> = { en: 'en_US', 'zh-Hant': 'zh_TW', 'zh-Hans': 'zh_CN' }

// One source for every marketing page's <title>, <meta description>, canonical
// and hreflang set. English lives at the bare path; the two Chinese locales sit
// under a segment, so the alternates map is built from that rule rather than
// hard-coded per page.
//
// {place} in a title or description is where the school teaches: "Brea" while
// one pool is open (the text is then exactly what it was before locations),
// every pool's name once there are more (lib/location-place.ts). Pages whose
// text names the place use liveMarketingMetadata below, which reads the pools.
export function marketingMetadata(
  slug: string, path: string, locale: Locale = DEFAULT_LOCALE,
  vars: Record<string, string> = {},
): Metadata {
  const url = (l: Locale) => SITE_URL + (l === DEFAULT_LOCALE ? '' : '/' + l) + path
  const languages: Record<string, string> = {}
  for (const l of LOCALES) languages[l] = url(l)
  languages['x-default'] = url(DEFAULT_LOCALE)
  const v = { place: HOME_PLACE, ...vars }
  const title = translate(locale, 'meta.' + slug + '.title', v)
  const description = translate(locale, 'meta.' + slug + '.description', v)
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

/** marketingMetadata with {place} filled from the pools open to families.
 *  The page that uses it sets `revalidate = 300` so the text follows a pool
 *  being turned on or off without a deploy. */
export async function liveMarketingMetadata(slug: string, path: string, locale: Locale = DEFAULT_LOCALE): Promise<Metadata> {
  const place = placeName(await publicLocations(), (k, v) => translate(locale, k, v))
  return marketingMetadata(slug, path, locale, { place })
}
