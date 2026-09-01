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
  OFF_PEAK_DISCOUNT, TOPUP_PRESETS, VIP_TIERS,
} from '@/lib/points'
import Link from 'next/link'
import { localePath } from '@/lib/i18n/paths'

// The pricing page under the points system. Every number here is read from
// lib/points.ts -- the same module the booking route charges from -- so the
// page cannot advertise a price the software will not honour. That was the
// whole failure mode of the old packages page, which spelled its figures out
// by hand and drifted away from checkout.

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'
const GOLD_BORDER = 'rgba(201,168,76,0.3)'

const money = (n: number) => '$' + n.toLocaleString('en-US')
const num = (n: number) => n.toLocaleString('en-US')

function SectionEyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      fontSize: '10px', fontWeight: 600, letterSpacing: '3px',
      textTransform: 'uppercase' as const,
      color: dark ? '#8a9ab8' : 'rgba(255,255,255,0.5)',
      marginBottom: '10px',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
      {children}
    </div>
  )
}

function Divider({ center = false }: { center?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start', gap: '10px', margin: '14px 0' }}>
      <div style={{ width: 36, height: 2, background: GOLD_BORDER, borderRadius: 1 }} />
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD }} />
      {center && <div style={{ width: 36, height: 2, background: GOLD_BORDER, borderRadius: 1 }} />}
    </div>
  )
}

function TeamTierList() {
  const t = useT()
  const locale = useLocale()
  const [tiers, setTiers] = useState<{ id: string; name: string; level_min: number; level_max: number; min_stage?: number; max_stage?: number; spots_left: number }[]>([])
  useEffect(() => {
    fetch('/api/team/tiers').then(r => r.ok ? r.json() : null).then(d => { if (d?.tiers) setTiers(d.tiers) }).catch(() => {})
  }, [])
  if (tiers.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px 18px' }}>
      {tiers.map(tier => (
        <div key={tier.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{tDb(locale, 'team_tiers', tier.id, tier.name)}</span>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}> · {tierBandLabel(tier, t('plans.team.stageWord'))}</span>
          </div>
          {tier.spots_left === 0 ? (
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#e05a4a' }}>{t('plans.team.full')}</span>
          ) : (
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{t(tier.spots_left === 1 ? 'plans.team.spotLeft' : 'plans.team.spotsLeft', { n: tier.spots_left })}</span>
          )}
        </div>
      ))}
      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>{t('plans.team.autoPlace')}</div>
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
      onClick={async () => {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        router.push(user ? '/checkout?plan=team' : '/login?redirect=/checkout?plan=team')
        setLoading(false)
      }}
      disabled={loading}
      style={{
        display: 'block', width: '100%', textAlign: 'center', padding: '11px 0', borderRadius: '8px',
        fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' as const,
        cursor: 'pointer', background: '#e05a4a', color: '#fff', border: '2px solid #e05a4a',
        opacity: loading ? 0.6 : 1,
      }}
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
  const [amount, setAmount] = useState<number>(TOPUP_PRESETS[1])
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsAssessment, setNeedsAssessment] = useState(false)

  const chosen = custom.trim() === '' ? amount : Math.floor(Number(custom))
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
    <div style={{ background: NAVY, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', padding: 'clamp(24px,3vw,36px)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        {TOPUP_PRESETS.map(p => {
          const on = custom.trim() === '' && amount === p
          return (
            <button
              key={p}
              onClick={() => { setAmount(p); setCustom('') }}
              style={{
                background: on ? 'rgba(201,168,76,0.14)' : 'rgba(255,255,255,0.05)',
                border: `2px solid ${on ? GOLD : 'rgba(255,255,255,0.12)'}`,
                borderRadius: '14px', padding: '20px 12px', cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '30px', fontWeight: 900, lineHeight: 1, color: on ? GOLD : '#fff' }}>
                {money(p)}
              </div>
              <div style={{ fontSize: '12px', marginTop: '6px', color: on ? GOLD : 'rgba(255,255,255,0.5)' }}>
                {t('points.buy.presetPoints', { n: num(p) })}
              </div>
            </button>
          )
        })}
      </div>

      <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
        {t('points.buy.custom')}
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.06)', border: `1px solid ${custom.trim() ? GOLD : 'rgba(255,255,255,0.15)'}`, borderRadius: '10px', padding: '0 14px' }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '16px' }}>$</span>
          <input
            type="number" inputMode="numeric" min={MIN_TOPUP_DOLLARS} max={MAX_TOPUP_DOLLARS}
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder={String(MIN_TOPUP_DOLLARS)}
            style={{
              background: 'transparent', border: 'none', outline: 'none', color: '#fff',
              fontSize: '18px', fontWeight: 700, padding: '12px 8px', width: '120px',
            }}
          />
        </div>
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
          {t('points.buy.min', { min: money(MIN_TOPUP_DOLLARS), max: money(MAX_TOPUP_DOLLARS) })}
        </span>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '20px 0 16px' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>{t('points.buy.youGet')}</span>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 900, color: GOLD }}>
          {valid ? t('points.buy.pointsFor', { n: num(chosen), price: money(chosen) }) : '—'}
        </span>
      </div>

      <button
        onClick={buy}
        disabled={!valid || busy}
        style={{
          display: 'block', width: '100%', padding: '14px 0', borderRadius: '10px',
          fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' as const,
          background: GOLD, color: NAVY, border: 'none',
          cursor: valid && !busy ? 'pointer' : 'not-allowed', opacity: valid && !busy ? 1 : 0.45,
        }}
      >
        {busy ? t('points.buy.busy') : t('points.buy.cta')}
      </button>

      {needsAssessment && (
        <div style={{ marginTop: '14px', background: 'rgba(201,168,76,0.1)', border: `1px solid ${GOLD}55`, borderRadius: '12px', padding: '14px 16px' }}>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', lineHeight: 1.7, marginBottom: '10px' }}>
            {t('points.buy.err.assessment')}
          </div>
          <Link href={localePath('/assessment', locale)} style={{ fontSize: '13px', fontWeight: 700, color: GOLD, textDecoration: 'none' }}>
            {t('plans.assessFirst.cta')}
          </Link>
        </div>
      )}
      {error && (
        <div style={{ marginTop: '14px', fontSize: '13px', color: '#ff9d8f' }}>{error}</div>
      )}

      <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, marginTop: '16px', marginBottom: 0 }}>
        {t('points.buy.fine')}
      </p>
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
  const tiers = [...VIP_TIERS].filter(x => x.level > 0).sort((a, b) => a.level - b.level)

  // The worked example is computed, not typed. A sentence with a hand-written
  // "58" in it is a sentence that goes wrong the first time a discount changes.
  const exBase = BASE_POINTS['1on1']
  const exVipPct = VIP_TIERS.find(x => x.level === 2)!.discount
  const exVip = Math.floor(exBase * (1 - exVipPct))
  const exBoth = Math.floor(exBase * (1 - exVipPct) * (1 - OFF_PEAK_DISCOUNT))

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100vh' }}>
      <div style={{ background: DARK }}>

      {/* HERO */}
      <div style={{ background: NAVY, position: 'relative', overflow: 'hidden', padding: 'clamp(80px,10vw,100px) clamp(24px,5vw,72px) clamp(40px,5vw,60px)' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1.5px, transparent 1.5px)', backgroundSize: '22px 22px' }} />
        <div style={{ position: 'absolute', right: '-60px', top: '50%', transform: 'translateY(-50%)', width: 380, height: 380, pointerEvents: 'none' }}>
          {[0, 60, 130].map((inset, i) => (
            <span key={i} style={{ position: 'absolute', borderRadius: '50%', border: `1px solid ${i === 2 ? 'rgba(201,168,76,0.13)' : 'rgba(255,255,255,0.07)'}`, inset }} />
          ))}
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <SectionEyebrow>{t('points.hero.eyebrow')}</SectionEyebrow>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(24px,3.2vw,40px)', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.5px', marginBottom: '12px' }}>
            {t('points.hero.title1')}<br /><em style={{ color: GOLD, fontStyle: 'italic' }}>{t('points.hero.title2')}</em>
          </h1>
          <Divider />
          <p style={{ fontSize: 'clamp(13px,1.3vw,15px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: '540px', marginBottom: '20px' }}>
            {t('points.hero.subtitle')}
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {['noExpiry', 'refundable', 'earned'].map(slug => (
              <span key={slug} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '30px', padding: '6px 14px', fontSize: '11px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
                {t('points.chip.' + slug)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The assessment is not bought with points -- it is the thing a family
          buys before they have any. So it sits above the wallet, not beside it. */}
      <section style={{ background: DARK, padding: '0 clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', transform: 'translateY(-28px)' }}>
          <div style={{ background: NAVY, border: `1px solid ${GOLD}55`, borderRadius: '16px', padding: '24px 28px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
            <div style={{ minWidth: '260px', flex: '1 1 380px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>{t('plans.assessFirst.title')}</div>
              <p style={{ fontSize: '13.5px', lineHeight: 1.7, color: 'rgba(255,255,255,0.6)', margin: 0, maxWidth: '60ch' }}>
                {t('points.assess.body', { price: money(TRIAL_PRICE_CENTS / 100) })}
              </p>
            </div>
            <Link href={localePath('/assessment', locale)}
              style={{ flexShrink: 0, padding: '12px 22px', borderRadius: '10px', background: GOLD, color: NAVY, fontSize: '13px', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {t('plans.assessFirst.cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* BUY + PRICE LIST, side by side. The list is next to the button on
          purpose: a parent deciding how much to put in needs to see what a
          lesson costs without scrolling away from the amount they are typing. */}
      <section id="buy" style={{ scrollMarginTop: '90px', padding: 'clamp(24px,4vw,48px) clamp(24px,5vw,72px) clamp(48px,6vw,80px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SectionEyebrow>{t('points.buy.eyebrow')}</SectionEyebrow>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,2.5vw,32px)', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>{t('points.buy.title')}</h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: '560px', marginBottom: '32px' }}>
            {t('points.buy.desc')}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', alignItems: 'start' }}>
            <TopUp />

            <div style={{ background: NAVY, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', padding: 'clamp(24px,3vw,36px)' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '4px' }}>
                {t('points.price.eyebrow')}
              </div>
              <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '18px' }}>
                {t('points.price.perStudent')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {lessonRows.map(row => (
                  <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)' }}>{t('points.price.row.' + row.key)}</span>
                    <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      <strong style={{ fontSize: '17px', color: GOLD }}>{t('points.unit', { n: row.points })}</strong>
                      <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginLeft: '7px' }}>{money(row.points)}</span>
                    </span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', padding: '11px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.85)' }}>{t('points.price.row.team')}</span>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{t('points.price.teamNote')}</span>
                </div>
              </div>
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, marginTop: '16px', marginBottom: 0 }}>
                {t('points.price.hour')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div style={{ background: '#f0f4f8', position: 'relative' }}>
        <svg viewBox="0 0 1440 40" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ display: 'block', width: '100%', marginTop: '-1px' }}>
          <path d="M0,20 C480,40 960,0 1440,20 L1440,0 L0,0 Z" fill={DARK} />
        </svg>
      </div>

      {/* DISCOUNTS */}
      <section id="discounts" style={{ scrollMarginTop: '90px', background: '#f0f4f8', padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SectionEyebrow dark>{t('points.disc.eyebrow')}</SectionEyebrow>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,2.5vw,32px)', fontWeight: 900, color: NAVY, marginBottom: '6px' }}>{t('points.disc.title')}</h2>
          <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.7, maxWidth: '620px', marginBottom: '32px' }}>
            {t('points.disc.desc')}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e9f0', padding: '28px 26px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>{t('points.disc.vipTitle')}</div>
              <p style={{ fontSize: '13.5px', color: '#5a6a8a', lineHeight: 1.7, marginTop: 0, marginBottom: '18px' }}>{t('points.disc.vipDesc')}</p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', minWidth: '260px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#8a9ab8', padding: '0 0 8px', borderBottom: '1px solid #dfe5ef' }}>{t('points.disc.col.level')}</th>
                      <th style={{ textAlign: 'left', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#8a9ab8', padding: '0 0 8px', borderBottom: '1px solid #dfe5ef' }}>{t('points.disc.col.lessons')}</th>
                      <th style={{ textAlign: 'right', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#8a9ab8', padding: '0 0 8px', borderBottom: '1px solid #dfe5ef' }}>{t('points.disc.col.off')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tiers.map(tier => (
                      <tr key={tier.level}>
                        <td style={{ padding: '9px 0', borderBottom: '1px solid #eef1f7', fontWeight: 700, color: NAVY }}>{t('points.disc.vipLevel', { n: tier.level })}</td>
                        <td style={{ padding: '9px 0', borderBottom: '1px solid #eef1f7', color: '#5a6a8a', fontVariantNumeric: 'tabular-nums' }}>{t('points.disc.lessonsDone', { n: tier.lessons })}</td>
                        <td style={{ padding: '9px 0', borderBottom: '1px solid #eef1f7', textAlign: 'right', fontWeight: 700, color: '#3a9a5c', fontVariantNumeric: 'tabular-nums' }}>−{Math.round(tier.discount * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: '12px', color: '#8a9ab8', lineHeight: 1.7, marginTop: '16px', marginBottom: 0 }}>{t('points.disc.retro')}</p>
            </div>

            <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #e5e9f0', padding: '28px 26px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: NAVY, marginBottom: '6px' }}>
                {t('points.disc.offTitle', { pct: Math.round(OFF_PEAK_DISCOUNT * 100) })}
              </div>
              <p style={{ fontSize: '13.5px', color: '#5a6a8a', lineHeight: 1.7, marginTop: 0, marginBottom: '18px' }}>{t('points.disc.offDesc')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {['weekday', 'weekend'].map(k => (
                  <div key={k} style={{ background: '#f5f8fc', border: '1px solid #e5e9f0', borderRadius: '10px', padding: '12px 14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#8a9ab8', marginBottom: '3px' }}>{t('points.disc.off.' + k + '.label')}</div>
                    <div style={{ fontSize: '14px', color: NAVY, fontWeight: 600 }}>{t('points.disc.off.' + k + '.hours')}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '12px', color: '#8a9ab8', lineHeight: 1.7, marginTop: '16px', marginBottom: 0 }}>{t('points.disc.offNote')}</p>
            </div>
          </div>

          <div style={{ marginTop: '24px', background: NAVY, borderRadius: '16px', padding: '24px 28px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>{t('points.example.eyebrow')}</div>
            <p style={{ fontSize: '14.5px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.8, margin: 0, maxWidth: '70ch' }}>
              {t('points.example.body', {
                base: exBase, vip: exVip, both: exBoth, saved: exBase - exBoth,
                pct: Math.round(exVipPct * 100),
              })}
            </p>
          </div>
        </div>
      </section>

      <div style={{ background: DARK, position: 'relative' }}>
        <svg viewBox="0 0 1440 40" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ display: 'block', width: '100%', marginTop: '-1px' }}>
          <path d="M0,20 C480,0 960,40 1440,20 L1440,0 L0,0 Z" fill="#f0f4f8" />
        </svg>
      </div>

      {/* SWIM TEAM — the one thing points do not buy */}
      <section id="team" style={{ scrollMarginTop: '90px', background: DARK, padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ background: NAVY, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', padding: 'clamp(28px,4vw,40px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px' }}>
            <div>
              <SectionEyebrow>{t('plans.team.eyebrow')}</SectionEyebrow>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(20px,2.2vw,28px)', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>{t('plans.team.title')}</h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>{t('plans.team.meta')}</p>
              <p style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, marginBottom: '20px' }}>
                {t('plans.team.desc')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {['feat1', 'feat2', 'feat3', 'feat4'].map((feat) => (
                  <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e05a4a', flexShrink: 0, display: 'inline-block' }} />
                    {t('plans.team.' + feat)}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <TeamTierList />
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: '16px' }}>
                {t('points.team.notPoints')}
              </p>
              <TeamButton />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: NAVY, padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1.5px, transparent 1.5px)', backgroundSize: '22px 22px' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '600px', margin: '0 auto' }}>
          <SectionEyebrow>{t('plans.cta.eyebrow')}</SectionEyebrow>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(24px,3vw,36px)', fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: '16px' }}>{t('plans.cta.title')}</h2>
          <Divider center />
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '32px' }}>
            {t('points.cta.desc')}
          </p>
          <Link href={localePath('/assessment', locale)} style={{
            display: 'inline-block', padding: '13px 32px', borderRadius: '8px', background: GOLD, color: NAVY,
            fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', textDecoration: 'none',
          }}>
            {t('points.cta.btn')}
          </Link>
        </div>
      </section>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      </div>
    </div>
  )
}
