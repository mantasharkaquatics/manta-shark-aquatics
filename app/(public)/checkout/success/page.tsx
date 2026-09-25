'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

// Palette B (2026-09): the site's dark top with a green tick, then what just
// happened as a short checklist on white, and the one next step in amber.
const css = `
  .su-tick { width: 56px; height: 56px; border-radius: 50%; background: #2e9d6a; color: #fff; display: grid; place-items: center;
    font-size: 28px; font-weight: 900; margin-bottom: 18px; box-shadow: 0 0 0 6px rgba(46,157,106,0.25); }
  .su-card { max-width: 560px; background: #fff; border: 1px solid ${BRAND.line}; border-radius: 18px; padding: 26px; }
  .su-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
  .su-list li { display: flex; gap: 12px; align-items: center; font-size: 15px; color: ${BRAND.ink}; line-height: 1.5; }
  .su-list li::before { content: '✓'; width: 24px; height: 24px; border-radius: 50%; background: #e6f4ee; color: #1f7a57; display: grid;
    place-items: center; font-size: 12px; font-weight: 800; flex-shrink: 0; }
  .su-actions { display: flex; flex-direction: column; gap: 10px; margin-top: 22px; }
  .su-actions .b-btn { width: 100%; }
  .su-count { font-size: 13px; color: ${BRAND.mute}; margin: 14px 0 0; text-align: center; }
`

function SuccessContent() {
  const t = useT()
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session_id')
  const isTeam = searchParams.get('team') === '1'
  const [countdown, setCountdown] = useState(30)

  useEffect(() => {
    if (!sessionId) { router.push('/'); return }
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          router.push('/dashboard')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [sessionId])

  const items = isTeam
    ? [t('success.team.1'), t('success.team.2'), t('success.emailSent'), t('success.team.4')]
    : [t('success.points.1'), t('success.points.2'), t('success.emailSent'), t('success.points.3')]

  return (
    <BrandRoot>
      <style>{css}</style>
      <header className="b-hero">
        <div className="b-wrap">
          <div className="su-tick" aria-hidden="true">✓</div>
          <p className="b-eyebrow">{t('success.eyebrow')}</p>
          <h1>{isTeam ? t('success.titleTeam') : t('success.titlePoints')}</h1>
          <p className="b-lead">{isTeam ? t('success.descTeam') : t('success.descPoints')}</p>
        </div>
      </header>

      <section className="b-sec b-paper" style={{ paddingTop: 48 }}>
        <div className="b-wrap">
          <div className="su-card">
            <ul className="su-list">
              {items.map((text, i) => <li key={i}>{text}</li>)}
            </ul>
            <div className="su-actions">
              <Link href={isTeam ? '/dashboard' : '/booking'} className="b-btn gold">
                {isTeam ? t('success.ctaTeam') : t('success.ctaBook')}
              </Link>
              {/* Both buttons would go to the same place for a team membership. */}
              {!isTeam && <Link href="/dashboard" className="b-btn line">{t('common.backToDashboard')}</Link>}
            </div>
            <p className="su-count">{t('success.redirecting', { n: countdown })}</p>
          </div>
        </div>
      </section>
    </BrandRoot>
  )
}

export default function SuccessPage() {
  const t = useT()
  return (
    <Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: BRAND.mute }}>{t('success.loading')}</div>}>
      <SuccessContent />
    </Suspense>
  )
}
