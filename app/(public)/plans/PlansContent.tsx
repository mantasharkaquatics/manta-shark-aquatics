'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { tierBandLabel } from '@/lib/team-tiers'
import { TRIAL_PRICE_CENTS } from '@/lib/plans'
import {
  ASSESSMENT_POINTS, BASE_POINTS, MIN_TOPUP_DOLLARS, MAX_TOPUP_DOLLARS,
  TOPUP_COURSES, TOPUP_LESSON_COUNTS, topUpAmount, type TopUpCourse,
  OFF_PEAK_DISCOUNT, OFF_PEAK_ENABLED,
} from '@/lib/points'
import Link from 'next/link'
import { localePath } from '@/lib/i18n/paths'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

// The pricing page under the points system. Every number here is read from
// lib/points.ts -- the same module the booking route charges from -- so the
// page cannot advertise a price the software will not honour. That was the
// whole failure mode of the old packages page, which spelled its figures out
// by hand and drifted away from checkout.
//
// Palette B (2026-09): dark top, light content. The buying card is white on
// the pale-blue band; the one amber button on it is "go to payment".

const money = (n: number) => '$' + n.toLocaleString('en-US')
const num = (n: number) => n.toLocaleString('en-US')

const css = `
  /* The assessment card sits over the hero's bottom edge: the first thing a
     new family needs, before any price. */
  .p-assess { position: relative; z-index: 2; margin-top: -36px; background: #fff; border: 1px solid ${BRAND.line};
    border-radius: 16px; padding: 22px 26px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
    gap: 16px; box-shadow: 0 18px 40px rgba(18,37,74,0.12); }
  .p-assess h3 { font-size: 17px; }
  .p-assess p { color: ${BRAND.mute}; font-size: 14px; line-height: 1.65; margin: 6px 0 0; max-width: 62ch; }
  .p-assess > div { flex: 1 1 380px; min-width: 240px; }

  .p-grid { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 24px; align-items: start; }
  .p-card { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 20px; padding: 30px; }
  .p-label { font-size: 13px; color: ${BRAND.mute}; margin: 0 0 8px; font-weight: 600; }

  .p-seg { display: inline-flex; flex-wrap: wrap; border: 1px solid ${BRAND.line}; border-radius: 10px; overflow: hidden; margin-bottom: 20px; background: ${BRAND.paper}; }
  .p-seg button { padding: 10px 18px; font-size: 14px; font-weight: 700; border: 0; cursor: pointer; background: transparent;
    color: ${BRAND.mute}; font-family: inherit; }
  .p-seg button[aria-pressed="true"] { background: ${BRAND.navy}; color: #fff; }

  .p-counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-bottom: 14px; }
  .p-count { background: #fff; border: 2px solid ${BRAND.line}; border-radius: 14px; padding: 18px 10px; cursor: pointer;
    text-align: center; font-family: inherit; color: ${BRAND.ink}; }
  .p-count:hover { border-color: #bcd0ea; }
  .p-count[aria-pressed="true"] { border-color: ${BRAND.blue}; background: #eef4fc; }
  .p-count b { display: block; font-family: var(--font-display), serif; font-size: 28px; font-weight: 900; line-height: 1; }
  .b-root.zh .p-count b { font-family: inherit; font-size: 24px; }
  .p-count[aria-pressed="true"] b { color: ${BRAND.blue}; }
  .p-count span { display: block; font-size: 12px; margin-top: 6px; color: ${BRAND.mute}; font-variant-numeric: tabular-nums; }
  .p-fine { font-size: 12px; color: ${BRAND.mute}; line-height: 1.7; margin: 0; }

  .p-total { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap;
    border-top: 1px solid ${BRAND.line}; margin-top: 20px; padding-top: 18px; margin-bottom: 16px; }
  .p-total span { font-size: 14px; color: ${BRAND.mute}; }
  .p-total strong { font-family: var(--font-display), serif; font-size: 28px; font-weight: 900; color: ${BRAND.navy}; font-variant-numeric: tabular-nums; }
  .p-buy { width: 100%; }
  .p-warn { margin-top: 14px; background: #fff8e8; border: 1px solid #f5d9a0; border-radius: 12px; padding: 14px 16px; font-size: 14px; line-height: 1.65; }
  .p-err { margin-top: 14px; font-size: 14px; color: #b3261e; }

  .p-price h3 { font-size: 18px; }
  .p-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 12px 0; border-bottom: 1px solid ${BRAND.line}; font-size: 15px; }
  .p-row strong { font-size: 17px; color: ${BRAND.navy}; font-variant-numeric: tabular-nums; }
  .p-row small { font-size: 12px; color: ${BRAND.mute}; margin-left: 7px; font-variant-numeric: tabular-nums; }

  .p-off { display: flex; flex-direction: column; gap: 10px; }
  .p-off div { background: ${BRAND.paper}; border: 1px solid ${BRAND.line}; border-radius: 10px; padding: 12px 14px; }

  /* Swim Team: the one thing points do not buy, so it is set apart in navy. */
  .p-team { background: ${BRAND.navy}; color: #fff; border-radius: 20px; padding: 36px; display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }
  .p-team .b-eyebrow { color: ${BRAND.yellow}; }
  .p-team h2 { font-size: 30px; margin-top: 8px; }
  .p-team .meta { font-size: 13px; color: rgba(255,255,255,0.6); margin: 8px 0; }
  .p-team .desc { font-size: 15px; color: rgba(255,255,255,0.78); line-height: 1.7; margin: 0 0 18px; }
  .p-feats { display: flex; flex-direction: column; gap: 8px; }
  .p-feats div { display: flex; align-items: center; gap: 10px; font-size: 14px; color: rgba(255,255,255,0.82); }
  .p-feats div::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: ${BRAND.yellow}; flex-shrink: 0; }
  .p-tiers { display: flex; flex-direction: column; gap: 9px; margin-bottom: 20px; background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 16px 18px; }
  .p-tiers .r { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 13.5px; }
  .p-tiers .r small { color: rgba(255,255,255,0.5); font-size: 12px; }
  .p-tiers .full { font-size: 12px; font-weight: 700; color: #ff9d8f; }
  .p-tiers .left { font-size: 12px; color: rgba(255,255,255,0.6); }
  .p-tiers .note { font-size: 12px; color: rgba(255,255,255,0.5); }
  .p-team .fine { font-size: 13px; color: rgba(255,255,255,0.6); line-height: 1.7; margin: 0 0 16px; }

  @media (max-width: 900px) {
    .p-grid, .p-team { grid-template-columns: 1fr; }
    .p-card, .p-team { padding: 24px; }
    .p-assess { margin-top: -28px; padding: 20px; }
    .p-assess .b-btn { width: 100%; }
  }
`

function TeamTierList() {
  const t = useT()
  const locale = useLocale()
  const [tiers, setTiers] = useState<{ id: string; name: string; level_min: number; level_max: number; min_stage?: number; max_stage?: number; spots_left: number }[]>([])
  useEffect(() => {
    fetch('/api/team/tiers').then(r => r.ok ? r.json() : null).then(d => { if (d?.tiers) setTiers(d.tiers) }).catch(() => {})
  }, [])
  if (tiers.length === 0) return null
  return (
    <div className="p-tiers">
      {tiers.map(tier => (
        <div key={tier.id} className="r">
          <div>
            <b>{tDb(locale, 'team_tiers', tier.id, tier.name)}</b>
            <small> · {tierBandLabel(tier, t('plans.team.stageWord'))}</small>
          </div>
          {tier.spots_left === 0
            ? <span className="full">{t('plans.team.full')}</span>
            : <span className="left">{t(tier.spots_left === 1 ? 'plans.team.spotLeft' : 'plans.team.spotsLeft', { n: tier.spots_left })}</span>}
        </div>
      ))}
      <div className="note">{t('plans.team.autoPlace')}</div>
    </div>
  )
}

/** The Swim Team button still buys a plan, because Swim Team is still a plan. */
function TeamButton() {
  const t = useT()
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  return (
    <button
      type="button"
      className="b-btn gold"
      style={{ width: '100%' }}
      onClick={async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        router.push(user ? '/checkout?plan=team' : '/login?redirect=/checkout?plan=team')
        setLoading(false)
      }}
      disabled={loading}
    >
      {loading ? '…' : t('plans.btn.joinTeam')}
    </button>
  )
}

/**
 * Buying points. The amount is the only thing the parent chooses, and the
 * dollars and the points are shown side by side at every step -- a parent
 * should never have to work out what a number on this page is worth.
 */
function TopUp() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const supabase = createClient()
  /* Two questions, not one nine-way comparison: which class, then how many.
     Opens on the group class because it is the cheapest way in -- $400 is a
     friendlier first number than $650, and a family who wants private lessons
     will happily press one more button to say so. */
  const [course, setCourse] = useState<TopUpCourse>('1on4')
  const [lessons, setLessons] = useState<number>(TOPUP_LESSON_COUNTS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsAssessment, setNeedsAssessment] = useState(false)

  const chosen = topUpAmount(course, lessons)
  // Always true for the grid as it stands. Kept anyway: it is the guard that
  // fails loudly if a base price ever moves the grid outside what the server
  // accepts, instead of shipping a button that 400s.
  const valid = Number.isFinite(chosen) && chosen >= MIN_TOPUP_DOLLARS && chosen <= MAX_TOPUP_DOLLARS

  async function buy() {
    if (!valid) return
    setBusy(true)
    setError(null)
    setNeedsAssessment(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login?redirect=/plans')
      return
    }
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: chosen }),
      })
      const data = await res.json()
      if (data.url) { window.location.href = data.url; return }
      if (data.error === 'NEEDS_ASSESSMENT') setNeedsAssessment(true)
      else if (data.error === 'INVALID_AMOUNT') setError(t('points.buy.err.amount', { min: money(MIN_TOPUP_DOLLARS), max: money(MAX_TOPUP_DOLLARS) }))
      else setError(t('points.buy.err.generic'))
    } catch {
      setError(t('points.buy.err.generic'))
    }
    setBusy(false)
  }

  return (
    <div className="p-card">
      {/* Which class, first. The points are not tied to one -- the note below
          says so -- but a parent thinking about buying is thinking about a
          class, not about a balance. */}
      <p className="p-label">{t('points.buy.pickCourse')}</p>
      <div className="p-seg" role="group">
        {TOPUP_COURSES.map(c => (
          <button key={c} type="button" aria-pressed={course === c} onClick={() => setCourse(c)}>
            {t('points.price.row.' + c)}
          </button>
        ))}
      </div>

      {/* Then how many. The biggest thing on the card is the number of LESSONS:
          choosing between ten and thirty lessons is choosing a course of study.
          The money is right underneath and the rate is unchanged. */}
      <div className="p-counts">
        {TOPUP_LESSON_COUNTS.map(n => {
          const price = topUpAmount(course, n)
          return (
            <button key={n} type="button" className="p-count" aria-pressed={lessons === n} onClick={() => setLessons(n)}>
              <b>{t('points.buy.presetCount', { n })}</b>
              <span>{money(price)} · {t('points.unit', { n: num(price) })}</span>
            </button>
          )
        })}
      </div>

      {/* Cards each naming one course type would imply a restriction that
          does not exist, so this has to say the points are shared. */}
      <p className="p-fine">{t('points.buy.countsNote')}</p>

      <div className="p-total">
        <span>{t('points.buy.youGet')}</span>
        <strong>{valid ? t('points.buy.pointsFor', { n: num(chosen), price: money(chosen) }) : '—'}</strong>
      </div>

      <button type="button" className="b-btn gold p-buy" onClick={buy} disabled={!valid || busy}>
        {busy ? t('points.buy.busy') : t('points.buy.cta')}
      </button>

      {needsAssessment && (
        <div className="p-warn">
          <div style={{ marginBottom: 8 }}>{t('points.buy.err.assessment')}</div>
          <Link href={localePath('/assessment', locale)} className="b-link">{t('plans.assessFirst.cta')}</Link>
        </div>
      )}
      {error && <div className="p-err">{error}</div>}

      <p className="p-fine" style={{ marginTop: 16 }}>{t('points.buy.fine')}</p>
    </div>
  )
}

export default function PlansContent() {
  const t = useT()
  const locale = useLocale()

  // The browser jumps to the hash the moment the HTML lands, then the web fonts
  // and the team-tier fetch change how tall everything above it is, and the
  // section the parent asked for has moved out from under them -- measured at
  // ~1700px off. So re-aim a few times while the page settles, and stop the
  // moment they scroll themselves, so we never fight them for the scrollbar.
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (!id) return
    let done = false
    const stop = () => { done = true }
    const aim = () => { if (!done) document.getElementById(id)?.scrollIntoView({ block: 'start' }) }
    const frame = requestAnimationFrame(aim)
    const timers = [120, 400, 900].map(ms => setTimeout(aim, ms))
    for (const ev of ['wheel', 'touchmove', 'keydown']) window.addEventListener(ev, stop, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      timers.forEach(clearTimeout)
      for (const ev of ['wheel', 'touchmove', 'keydown']) window.removeEventListener(ev, stop)
    }
  }, [])

  const lessonRows = [
    { key: 'assessment', points: ASSESSMENT_POINTS },
    { key: '1on1', points: BASE_POINTS['1on1'] },
    { key: '1on2', points: BASE_POINTS['1on2'] },
    { key: '1on4', points: BASE_POINTS['1on4'] },
  ]

  return (
    <BrandRoot>
      <style>{css}</style>

      {/* HERO */}
      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">{t('points.hero.eyebrow')}</p>
          <h1>{t('points.hero.title1')}{locale.startsWith('zh') ? '' : ' '}<em>{t('points.hero.title2')}</em></h1>
          <p className="b-lead">{t('points.hero.subtitle')}</p>
          {/* Only promises that hold for purchased points today. ("Discounts
              you earn" went with VIP; off-peak is switched off.) */}
          <div className="b-chips">
            {['oneDollar', 'noExpiry', 'refundable'].map(slug => (
              <span key={slug}>{t('points.chip.' + slug)}</span>
            ))}
          </div>
        </div>
      </header>

      <div className="b-paper">
        {/* The assessment is not bought with points -- it is the thing a family
            buys before they have any. So it sits above the wallet. */}
        <div className="b-wrap">
          <div className="p-assess">
            <div>
              <h3>{t('plans.assessFirst.title')}</h3>
              <p>{t('points.assess.body', { price: money(TRIAL_PRICE_CENTS / 100) })}</p>
            </div>
            <Link href={localePath('/assessment', locale)} className="b-btn line">{t('plans.assessFirst.cta')}</Link>
          </div>
        </div>

        {/* BUY + PRICE LIST, side by side. The list is next to the button on
            purpose: a parent deciding how much to put in needs to see what a
            lesson costs without scrolling away. */}
        <section id="buy" className="b-sec" style={{ scrollMarginTop: 90, paddingTop: 64 }}>
          <div className="b-wrap">
            <div className="b-head">
              <p className="b-eyebrow">{t('points.buy.eyebrow')}</p>
              <h2>{t('points.buy.title')}</h2>
              <p>{t('points.buy.desc')}</p>
            </div>

            <div className="p-grid">
              <TopUp />

              <div className="p-card p-price">
                <p className="b-eyebrow">{t('points.price.eyebrow')}</p>
                <p className="p-label" style={{ marginTop: 6, marginBottom: 10, fontWeight: 400 }}>{t('points.price.perStudent')}</p>
                {lessonRows.map(row => (
                  <div key={row.key} className="p-row">
                    <span>{t('points.price.row.' + row.key)}</span>
                    <span style={{ whiteSpace: 'nowrap' }}>
                      <strong>{t('points.unit', { n: row.points })}</strong>
                      <small>{money(row.points)}</small>
                    </span>
                  </div>
                ))}
                <div className="p-row">
                  <span>{t('points.price.row.team')}</span>
                  <small>{t('points.price.teamNote')}</small>
                </div>
                <p className="p-fine" style={{ marginTop: 16 }}>{t('points.price.hour')}</p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* DISCOUNTS. There are none today: VIP was removed (2026-09) and
          off-peak is switched off in lib/points. This band only appears if
          off-peak is switched back on. */}
      {OFF_PEAK_ENABLED && (
        <section id="discounts" className="b-sec" style={{ scrollMarginTop: 90 }}>
          <div className="b-wrap">
            <div className="b-head">
              <p className="b-eyebrow">{t('points.disc.eyebrow')}</p>
              <h2>{t('points.disc.title')}</h2>
              <p>{t('points.disc.desc')}</p>
            </div>
            <div className="b-card" style={{ maxWidth: 520 }}>
              <h3>{t('points.disc.offTitle', { pct: Math.round(OFF_PEAK_DISCOUNT * 100) })}</h3>
              <p>{t('points.disc.offDesc')}</p>
              <div className="p-off" style={{ marginTop: 16 }}>
                {['weekday', 'weekend'].map(k => (
                  <div key={k}>
                    <p className="b-eyebrow" style={{ color: BRAND.mute }}>{t('points.disc.off.' + k + '.label')}</p>
                    <b>{t('points.disc.off.' + k + '.hours')}</b>
                  </div>
                ))}
              </div>
              <p>{t('points.disc.offNote')}</p>
            </div>
          </div>
        </section>
      )}

      {/* SWIM TEAM — the one thing points do not buy */}
      <section id="team" className="b-sec" style={{ scrollMarginTop: 90 }}>
        <div className="b-wrap">
          <div className="p-team">
            <div>
              <p className="b-eyebrow">{t('plans.team.eyebrow')}</p>
              <h2>{t('plans.team.title')}</h2>
              <p className="meta">{t('plans.team.meta')}</p>
              <p className="desc">{t('plans.team.desc')}</p>
              <div className="p-feats">
                {['feat1', 'feat2', 'feat3', 'feat4'].map(feat => <div key={feat}>{t('plans.team.' + feat)}</div>)}
              </div>
            </div>
            <div>
              <TeamTierList />
              <p className="fine">{t('points.team.notPoints')}</p>
              <TeamButton />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="b-final">
        <div className="b-wrap">
          <p className="b-eyebrow" style={{ color: BRAND.yellow, marginBottom: 12 }}>{t('plans.cta.eyebrow')}</p>
          <h2>{t('plans.cta.title')}</h2>
          <p>{t('points.cta.desc')}</p>
          <div className="b-ctas">
            <Link href={localePath('/assessment', locale)} className="b-btn gold">{t('points.cta.btn')}</Link>
          </div>
        </div>
      </section>
    </BrandRoot>
  )
}
