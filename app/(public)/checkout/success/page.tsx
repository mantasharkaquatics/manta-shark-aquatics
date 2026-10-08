'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'
import { formatTime12h } from '@/lib/date'
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

type Phase = 'checking' | 'done' | 'slow' | 'received' | 'unpaid'
const POLL_MS = 2000
const GIVE_UP_MS = 30000

function SuccessContent() {
  const t = useT()
  const locale = useLocale()
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session_id')
  const isTeam = searchParams.get('team') === '1'
  // A Swim Assessment paid through a link the desk (or chat) made. Often a
  // phone that is not signed in, so it is checked by the checkout id alone.
  const isAssessment = searchParams.get('assessment') === '1'
  const [countdown, setCountdown] = useState(30)
  /* Points arrive by the Stripe webhook, not with this page. It used to say
     "points added" the moment it loaded; a family who then went straight to
     booking could be told they were short (found 2026-10-08). So the page
     asks until the payment is on the books, and says "processing" until then. */
  const [phase, setPhase] = useState<Phase>(isTeam ? 'done' : 'checking')
  const [balance, setBalance] = useState<number | null>(null)
  const [when, setWhen] = useState<{ date: string; time: string } | null>(null)

  useEffect(() => {
    if (!sessionId) { router.push('/'); return }
    if (isTeam) return
    let live = true
    const started = Date.now()
    let timer: ReturnType<typeof setTimeout> | null = null
    const ask = async () => {
      try {
        if (isAssessment) {
          const r = await fetch('/api/stripe/trial-status?session_id=' + encodeURIComponent(sessionId))
          const j = await r.json().catch(() => ({}))
          if (!live) return
          if (j.state === 'confirmed') { if (j.date && j.time) setWhen({ date: j.date, time: j.time }); setPhase('done'); return }
          if (j.state === 'received') { setPhase('received'); return }
          if (j.state === 'unpaid') { setPhase('unpaid'); return }
        } else {
          const r = await fetch('/api/parent/wallet?session=' + encodeURIComponent(sessionId))
          const j = await r.json().catch(() => ({}))
          if (!live) return
          if (j.credited) { setBalance(typeof j.balancePurchased === 'number' ? j.balancePurchased : null); setPhase('done'); return }
        }
      } catch { /* asked again below */ }
      if (!live) return
      if (Date.now() - started >= GIVE_UP_MS) { setPhase('slow'); return }
      timer = setTimeout(ask, POLL_MS)
    }
    ask()
    return () => { live = false; if (timer) clearTimeout(timer) }
  }, [sessionId, isTeam, isAssessment])

  // Off to the dashboard once there is something true to show there. Not for
  // an assessment: that page may be open on a phone that is not signed in.
  const autoRedirect = !isAssessment && (phase === 'done' || phase === 'slow')
  useEffect(() => {
    if (!sessionId || !autoRedirect) return
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
  }, [sessionId, autoRedirect])

  const whenText = when
    ? t('success.assess.when', {
        date: new Date(when.date + 'T12:00:00Z').toLocaleDateString(dateTag(locale), { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
        time: formatTime12h(when.time),
      })
    : ''

  let title: string, desc: string, items: string[]
  if (isTeam) {
    title = t('success.titleTeam'); desc = t('success.descTeam')
    items = [t('success.team.1'), t('success.team.2'), t('success.emailSent'), t('success.team.4')]
  } else if (isAssessment) {
    title = phase === 'done' ? t('success.assess.title') : phase === 'unpaid' ? t('success.assess.unpaidTitle') : t('success.received')
    desc = phase === 'done' ? (whenText || t('success.assess.confirmed'))
      : phase === 'received' ? t('success.assess.receivedDesc')
      : phase === 'unpaid' ? t('success.assess.unpaidDesc')
      : phase === 'slow' ? t('success.assess.slow')
      : t('success.assess.checking')
    items = phase === 'done' ? [t('success.received'), t('success.emailSent')] : []
  } else {
    title = phase === 'done' ? t('success.titlePoints') : t('success.received')
    desc = phase === 'done' ? t('success.descPoints') : phase === 'slow' ? t('success.points.slow') : t('success.points.checking')
    items = phase === 'done'
      ? [t('success.points.1'), ...(balance != null ? [t('success.points.balance', { n: balance.toLocaleString('en-US') })] : []), t('success.points.2'), t('success.emailSent'), t('success.points.3')]
      : []
  }
  const ok = phase === 'done' || phase === 'received'

  return (
    <BrandRoot>
      <style>{css}</style>
      <header className="b-hero">
        <div className="b-wrap">
          <div className="su-tick" aria-hidden="true" style={ok ? undefined : { background: '#56647d', boxShadow: '0 0 0 6px rgba(86,100,125,0.25)' }}>{ok ? '✓' : phase === 'unpaid' ? '!' : '…'}</div>
          <p className="b-eyebrow">{phase === 'unpaid' ? t('success.assess.unpaidTitle') : t('success.eyebrow')}</p>
          <h1>{title}</h1>
          <p className="b-lead" role="status">{desc}</p>
        </div>
      </header>

      <section className="b-sec b-paper" style={{ paddingTop: 48 }}>
        <div className="b-wrap">
          <div className="su-card">
            {items.length > 0 && (
              <ul className="su-list">
                {items.map((text, i) => <li key={i}>{text}</li>)}
              </ul>
            )}
            <div className="su-actions">
              {isAssessment ? (
                <Link href="/dashboard" className="b-btn gold">{t('common.backToDashboard')}</Link>
              ) : (
                <>
                  <Link href={isTeam ? '/dashboard' : '/booking'} className="b-btn gold">
                    {isTeam ? t('success.ctaTeam') : t('success.ctaBook')}
                  </Link>
                  {/* Both buttons would go to the same place for a team membership. */}
                  {!isTeam && <Link href="/dashboard" className="b-btn line">{t('common.backToDashboard')}</Link>}
                </>
              )}
            </div>
            {autoRedirect || isTeam ? <p className="su-count">{t('success.redirecting', { n: countdown })}</p> : null}
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
