'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'
import { reportClientError, isStaleCode, reloadForStaleCode } from '@/lib/report-client-error'

/* When a page fails to draw, the family sees the school's own page in its
   language (2026-11-04: Next's English "This page couldn't load" showed on
   Chinese pages). The error itself still reaches the school: console.error
   is the alert (lib/error-report.ts, ClientErrorReporter). */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT()
  useEffect(() => {
    console.error('[page error]', error?.message || error)
    reportClientError(error, 'page')
    if (isStaleCode(error)) reloadForStaleCode()
  }, [error])
  return (
    <div style={{ minHeight: '60dvh', display: 'grid', placeItems: 'center', padding: '120px 20px 60px', background: '#e9eff7' }}>
      <div role="alert" style={{ maxWidth: 420, width: '100%', background: '#fff', border: `1px solid ${BRAND.line}`, borderRadius: 18, padding: '28px 24px', textAlign: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" width={56} height={56} style={{ borderRadius: '50%', margin: '0 auto 12px', display: 'block' }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: BRAND.navy, margin: '0 0 8px' }}>{t('errPage.title')}</h1>
        <p style={{ fontSize: 14.5, color: BRAND.mute, lineHeight: 1.6, margin: '0 0 18px' }}>{t('errPage.body')}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => reset()}
            style={{ border: 0, borderRadius: 10, background: BRAND.amber, color: BRAND.navy, fontWeight: 800, fontSize: 15, padding: '12px 20px', cursor: 'pointer', fontFamily: 'inherit' }}>
            {t('errPage.retry')}
          </button>
          <Link href="/dashboard" style={{ borderRadius: 10, border: `1px solid ${BRAND.line}`, color: BRAND.blue, fontWeight: 800, fontSize: 15, padding: '11px 20px', textDecoration: 'none' }}>
            {t('errPage.home')}
          </Link>
        </div>
      </div>
    </div>
  )
}
