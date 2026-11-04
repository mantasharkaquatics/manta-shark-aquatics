import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'
import { cookies } from 'next/headers'
import { translate, isLocale, DEFAULT_LOCALE } from '@/lib/i18n/all'
import { LOCALE_COOKIE } from '@/lib/i18n'

// One frame for every legal document (terms, privacy, waiver, media release,
// SMS terms), so they read as one set: the same dark top as the rest of the
// site, then the text on white in a comfortable reading width. The documents
// themselves are plain <h2>/<p>/<ul>; this sheet styles them.
const css = `
  .lg-doc { max-width: 760px; margin: 0 auto; }
  .lg-back { display: inline-block; font-size: 14px; font-weight: 700; color: ${BRAND.blue}; text-decoration: none; margin-bottom: 8px; }
  .lg-back:hover { color: ${BRAND.navy}; }
  .lg-doc h2 { font-family: var(--font-display), 'PingFang TC', serif; font-size: 22px; font-weight: 800; color: ${BRAND.navy};
               margin: 40px 0 12px; line-height: 1.3; }
  .lg-doc p, .lg-doc li { font-size: 15.5px; line-height: 1.8; color: #34435e; }
  .lg-doc p { margin: 0 0 14px; }
  .lg-doc ul { margin: 0 0 14px; padding-left: 22px; list-style: disc; }
  .lg-doc li::marker { color: ${BRAND.blue}; }
  .lg-doc li + li { margin-top: 6px; }
  .lg-doc strong { color: ${BRAND.navy}; }
  .lg-doc a { color: ${BRAND.blue}; font-weight: 700; }
  /* Inside the app (owner, 2026-11-03): the title on the app's pale blue and
     the text on a white card -- no dark hero, and no "all terms" link (the
     app's top bar has its back arrow). Done in CSS so the documents stay
     server pages. */
  .lg-app { display: none; }
  html.msa-app .lg-web, html.msa-app .lg-back { display: none; }
  html.msa-app .lg-app { display: block; padding: 14px 16px 0; max-width: 640px; margin: 0 auto; }
  html.msa-app .b-root:has(.lg-app), html.msa-app body:has(.lg-app), html.msa-app body:has(.lg-app) .rn-space { background: #e9eff7; }
  .b-root .lg-app h1 { font-family: inherit; font-size: 24px; font-weight: 800; color: ${BRAND.navy}; margin: 0 0 4px; line-height: 1.3; }
  .lg-app p { font-size: 13px; font-weight: 700; color: ${BRAND.mute}; margin: 0; }
  html.msa-app .lg-sec { padding: 12px 0 24px !important; }
  html.msa-app .lg-sec > .b-wrap { padding: 0 16px; }
  html.msa-app .lg-doc { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px; padding: 4px 18px 10px; max-width: 640px; }
  html.msa-app .lg-doc h2 { font-family: inherit; font-size: 18px; margin: 22px 0 8px; }
  html.msa-app .lg-doc p, html.msa-app .lg-doc li { font-size: 14.5px; line-height: 1.75; }
  /* "In plain terms" summaries: set apart so a parent can read just these. */
  .lg-plain { background: ${BRAND.paper}; border: 1px solid ${BRAND.line}; border-radius: 12px; padding: 14px 18px; margin: 0 0 16px;
              font-size: 15px; line-height: 1.7; color: ${BRAND.ink}; }
`

export default async function LegalPage({ title, subtitle, meta, children }: {
  title: string
  subtitle?: string
  meta?: React.ReactNode
  children: React.ReactNode
}) {
  /* The documents stay in English (they are what governs); a Chinese reader
     is told so in their own language first (2026-11-04). */
  const c = (await cookies()).get(LOCALE_COOKIE)?.value
  const locale = c && isLocale(c) ? c : DEFAULT_LOCALE
  const enOnly = locale === 'en' ? null : translate(locale, 'legal.enOnly')
  return (
    <BrandRoot>
      <style>{css}</style>
      <header className="b-hero lg-web">
        <div className="b-wrap">
          <p className="b-eyebrow">Terms &amp; Policies</p>
          <h1>{title}</h1>
          {subtitle && <p className="b-lead">{subtitle}</p>}
          {meta && <div className="b-chips"><span>{meta}</span></div>}
        </div>
      </header>
      <div className="lg-app">
        <h1>{title}</h1>
        {meta && <p>{meta}</p>}
      </div>
      <section className="b-sec lg-sec" style={{ paddingTop: 48 }}>
        <div className="b-wrap">
          <article className="lg-doc">
            <Link href="/policies" className="lg-back">← All terms &amp; policies</Link>
            {enOnly && <p className="lg-plain" lang={locale}>{enOnly}</p>}
            {children}
          </article>
        </div>
      </section>
    </BrandRoot>
  )
}
