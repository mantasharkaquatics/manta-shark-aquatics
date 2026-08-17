'use client'
import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'

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

export default function PoliciesContent() {
  const t = useT()
  return (
    <div style={{ minHeight: '100vh', background: '#111d38', padding: '60px 20px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>
        <p style={{ fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '8px' }}>Manta Shark Aquatics</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '34px', fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>{t('policies.title')}</h1>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '0 0 32px' }}>{t('policies.subtitle')}</p>
        {DOCS.map(doc => (
          <Link key={doc.href} href={doc.href} style={{ display: 'block', textDecoration: 'none', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '18px 20px', marginBottom: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#c9a84c', marginBottom: '4px' }}>{t(doc.nameKey)} \u2192</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>{t(doc.descKey)}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
