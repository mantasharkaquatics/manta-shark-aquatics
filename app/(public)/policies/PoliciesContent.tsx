'use client'
import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

// A real overview page, replacing a five-line redirect to /terms. The nav had a
// single entry that landed on a document with a different name, and the register
// form's "School Policies" checkbox pointed here too — parents agreed to two
// documents but could only reach one.
const DOCS = [
  { href: '/terms', nameKey: 'legal.terms', descKey: 'policies.terms.desc' },
  { href: '/privacy-policy', nameKey: 'legal.privacy', descKey: 'policies.privacy.desc' },
  { href: '/waiver', nameKey: 'legal.waiver', descKey: 'policies.waiver.desc' },
  { href: '/media-release', nameKey: 'legal.mediaRelease', descKey: 'policies.mediaRelease.desc' },
  { href: '/sms-terms', nameKey: 'legal.smsTerms', descKey: 'policies.smsTerms.desc' },
]

const css = `
  .po-list { max-width: 760px; display: flex; flex-direction: column; gap: 10px; }
  .po-doc { display: flex; align-items: center; gap: 16px; background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px;
            padding: 20px 22px; text-decoration: none; transition: border-color 0.15s, box-shadow 0.15s; }
  .po-doc:hover { border-color: #c9d8ee; box-shadow: 0 6px 20px rgba(18,37,74,0.06); }
  .po-doc:focus-visible { outline: 3px solid ${BRAND.yellow}; outline-offset: 2px; }
  .po-doc div { flex: 1; min-width: 0; }
  .po-doc b { display: block; font-size: 17px; color: ${BRAND.navy}; margin-bottom: 4px; }
  .po-doc span { display: block; font-size: 14.5px; color: ${BRAND.mute}; line-height: 1.6; }
  .po-doc i { font-style: normal; font-size: 20px; color: ${BRAND.blue}; flex-shrink: 0; }
`

export default function PoliciesContent() {
  const t = useT()
  return (
    <BrandRoot>
      <style>{css}</style>
      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">Manta Shark Aquatics</p>
          <h1>{t('policies.title')}</h1>
          <p className="b-lead">{t('policies.subtitle')}</p>
        </div>
      </header>
      <section className="b-sec b-paper" style={{ paddingTop: 56 }}>
        <div className="b-wrap">
          <div className="po-list">
            {DOCS.map(doc => (
              <Link key={doc.href} href={doc.href} className="po-doc">
                <div>
                  <b>{t(doc.nameKey)}</b>
                  <span>{t(doc.descKey)}</span>
                </div>
                <i aria-hidden="true">›</i>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </BrandRoot>
  )
}
