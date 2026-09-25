import Link from 'next/link'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

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
  /* "In plain terms" summaries: set apart so a parent can read just these. */
  .lg-plain { background: ${BRAND.paper}; border: 1px solid ${BRAND.line}; border-radius: 12px; padding: 14px 18px; margin: 0 0 16px;
              font-size: 15px; line-height: 1.7; color: ${BRAND.ink}; }
`

export default function LegalPage({ title, subtitle, meta, children }: {
  title: string
  subtitle?: string
  meta?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <BrandRoot>
      <style>{css}</style>
      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">Terms &amp; Policies</p>
          <h1>{title}</h1>
          {subtitle && <p className="b-lead">{subtitle}</p>}
          {meta && <div className="b-chips"><span>{meta}</span></div>}
        </div>
      </header>
      <section className="b-sec" style={{ paddingTop: 48 }}>
        <div className="b-wrap">
          <article className="lg-doc">
            <Link href="/policies" className="lg-back">← All terms &amp; policies</Link>
            {children}
          </article>
        </div>
      </section>
    </BrandRoot>
  )
}
