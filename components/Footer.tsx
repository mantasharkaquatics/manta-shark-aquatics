'use client'
import Image from 'next/image'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'

const LINKS = [
  { labelKey: 'page.services', href: '/services' },
  { labelKey: 'page.levels', href: '/levels' },
  { labelKey: 'page.plans', href: '/plans' },
  { labelKey: 'page.about', href: '/about' },
]

const LEGAL = [
  { labelKey: 'legal.terms', href: '/terms' },
  { labelKey: 'legal.privacy', href: '/privacy-policy' },
  { labelKey: 'legal.waiver', href: '/waiver' },
  { labelKey: 'legal.mediaRelease', href: '/media-release' },
  { labelKey: 'legal.smsTerms', href: '/sms-terms' },
]

export default function Footer() {
  const t = useT()
  const locale = useLocale()

  return (
    <footer style={{ background: '#0d1529', padding: '48px 48px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '40px', marginBottom: '40px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <Image src="/logo.png" alt="Manta Shark Aquatics" width={48} height={48} />
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', fontWeight: 700, color: 'white' }}>Manta Shark Aquatics</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>{t('footer.region')}</div>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>{t('footer.tagline')}</p>
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '16px' }}>{t('footer.links')}</div>
            {LINKS.map(l => (
              <div key={l.href} style={{ marginBottom: '8px' }}>
                <Link href={localePath(l.href, locale)} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>{t(l.labelKey)}</Link>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '16px' }}>{t('footer.legal')}</div>
            {LEGAL.map(l => (
              <div key={l.href} style={{ marginBottom: '8px' }}>
                <Link href={l.href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>{t(l.labelKey)}</Link>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#c9a84c', marginBottom: '16px' }}>{t('footer.contact')}</div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.8 }}>
              info@mantasharkaquatics.net<br />
              {t('footer.location')}<br />
              {t('footer.hours')}
            </p>
            <div style={{ marginTop: '14px' }}>
              <Link href="/coach-login" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', textDecoration: 'none' }}>{t('footer.coachLogin')} →</Link>
            </div>
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px', textAlign: 'center', fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>
          {t('footer.copyright', { year: 2026 })}
        </div>
      </div>
    </footer>
  )
}
