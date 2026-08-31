import { translate, type Locale } from '@/lib/i18n'
import { FAQ_IDS } from '@/lib/faq'

// FAQPage structured data, built from the same ids the page renders, so Google
// can never be shown a question the page does not answer -- which is what the
// guidelines forbid and what happens the moment the two are typed separately.
export function faqJsonLd(locale: Locale) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_IDS.map(id => ({
      '@type': 'Question',
      name: translate(locale, 'faq.q.' + id),
      acceptedAnswer: { '@type': 'Answer', text: translate(locale, 'faq.a.' + id) },
    })),
  }
}
