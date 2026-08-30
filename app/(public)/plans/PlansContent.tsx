'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'
import { tierBandLabel } from '@/lib/team-tiers'

const PRIVATE_PACKAGES = [
  { id: '1on1-10', sessions: 10, total: 650,  perSession: 65,    savings: null, badge: null,      validityMonths: 4 },
  { id: '1on1-20', sessions: 20, total: 1260, perSession: 63,    savings: 40,   badge: null,      validityMonths: 8 },
  { id: '1on1-30', sessions: 30, total: 1850, perSession: 61.67, savings: 100,  badge: 'popular', validityMonths: 12 },
  { id: '1on1-50', sessions: 50, total: 3000, perSession: 60,    savings: 250,  badge: 'best',    validityMonths: 18 },
]

const SEMI_PACKAGES = [
  { id: '1on2-10', sessions: 10, total: 1050, perSession: 105, savings: null, badge: null,      validityMonths: 4 },
  { id: '1on2-20', sessions: 20, total: 2000, perSession: 100, savings: 100,  badge: null,      validityMonths: 8 },
  { id: '1on2-30', sessions: 30, total: 2850, perSession: 95,  savings: 300,  badge: 'popular', validityMonths: 12 },
  { id: '1on2-50', sessions: 50, total: 4500, perSession: 90,  savings: 750,  badge: 'best',    validityMonths: 18 },
]

const GROUP_OPTIONS = [
  { id: '1on4-10', sessions: 10, price: 400, perSession: 40, savings: null, validityMonths: 4 },
  { id: '1on4-20', sessions: 20, price: 760, perSession: 38, savings: 40, validityMonths: 8 },
]

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'
const GOLD_BORDER = 'rgba(201,168,76,0.3)'

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

function GetStartedButton({ accentColor, isFeatured, labelKey = 'plans.btn.getStarted', planId = '' }: {
  accentColor: string
  isFeatured: boolean
  labelKey?: string
  planId?: string
}) {
  const t = useT()
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      router.push(`/checkout?plan=${planId}`)
    } else {
      router.push(`/login?redirect=/checkout?plan=${planId}`)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        display: 'block', width: '100%', textAlign: 'center',
        padding: '11px 0', borderRadius: '8px',
        fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px',
        textTransform: 'uppercase' as const, cursor: 'pointer',
        background: isFeatured ? accentColor : 'transparent',
        color: isFeatured ? (accentColor === GOLD ? NAVY : '#fff') : accentColor,
        border: `2px solid ${accentColor}`,
        transition: 'opacity 0.15s',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? '...' : t(labelKey)}
    </button>
  )
}

function PackageCard({ pkg, accentColor }: { pkg: typeof PRIVATE_PACKAGES[0]; accentColor: string }) {
  const t = useT()
  const isFeatured = !!pkg.badge
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: isFeatured ? NAVY : '#fff',
        border: `2px solid ${isFeatured ? accentColor : hovered ? accentColor : '#e5e9f0'}`,
        borderRadius: '16px', padding: '28px 24px',
        display: 'flex', flexDirection: 'column', gap: '6px',
        transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered
          ? `0 8px 32px rgba(0,0,0,${isFeatured ? '0.3' : '0.12'})`
          : isFeatured ? '0 4px 20px rgba(0,0,0,0.2)' : '0 2px 8px rgba(26,52,128,0.06)',
      }}
    >
      {pkg.badge && (
        <div style={{
          position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
          background: accentColor, color: '#fff',
          fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', padding: '4px 14px', borderRadius: '20px', whiteSpace: 'nowrap',
        }}>
          {t('plans.badge.' + pkg.badge)}
        </div>
      )}
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: isFeatured ? 'rgba(255,255,255,0.5)' : '#8a9ab8' }}>
        {t('plans.pkg.sessions', { n: pkg.sessions })}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', margin: '8px 0 4px' }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 900, color: isFeatured ? accentColor : NAVY, lineHeight: 1 }}>
          ${pkg.total.toLocaleString()}
        </span>
        <span style={{ fontSize: '12px', color: isFeatured ? 'rgba(255,255,255,0.4)' : '#8a9ab8' }}>{t('plans.pkg.total')}</span>
      </div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: isFeatured ? 'rgba(255,255,255,0.7)' : '#5a6a8a' }}>
        {t('plans.pkg.perSession', { price: pkg.perSession % 1 === 0 ? pkg.perSession : pkg.perSession.toFixed(2) })}
      </div>
      <div style={{ fontSize: '12px', color: isFeatured ? 'rgba(255,255,255,0.45)' : '#8a9ab8', marginTop: '2px' }}>
        {t('plans.pkg.validity', { n: pkg.validityMonths })}
      </div>
      {pkg.savings ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: isFeatured ? 'rgba(201,168,76,0.15)' : 'rgba(76,175,114,0.1)',
          border: `1px solid ${isFeatured ? 'rgba(201,168,76,0.3)' : 'rgba(76,175,114,0.25)'}`,
          borderRadius: '20px', padding: '3px 10px',
          fontSize: '11px', fontWeight: 600,
          color: isFeatured ? GOLD : '#3a9a5c',
          marginTop: '6px', width: 'fit-content',
        }}>
          {t('plans.pkg.save', { amount: pkg.savings })}
        </div>
      ) : <div style={{ height: '26px', marginTop: '6px' }} />}
      <div style={{ borderTop: `1px solid ${isFeatured ? 'rgba(255,255,255,0.1)' : '#eef1f7'}`, margin: '12px 0' }} />
      <GetStartedButton accentColor={accentColor} isFeatured={isFeatured} planId={pkg.id} />
    </div>
  )
}

export default function PlansContent() {
  const t = useT()

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
          <SectionEyebrow>{t('plans.hero.eyebrow')}</SectionEyebrow>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(24px,3.2vw,40px)', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.5px', marginBottom: '12px' }}>
            {t('plans.hero.title1')}<br /><em style={{ color: GOLD, fontStyle: 'italic' }}>{t('plans.hero.title2')}</em>
          </h1>
          <Divider />
          <p style={{ fontSize: 'clamp(13px,1.3vw,15px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: '520px', marginBottom: '20px' }}>
            {t('plans.hero.subtitle')}
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {[
              { slug: 'private', dot: GOLD },
              { slug: 'semi', dot: '#4a90c4' },
              { slug: 'group', dot: '#4caf72' },
              { slug: 'team', dot: '#e05a4a' },
            ].map((chip) => (
              <span key={chip.slug} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '30px', padding: '6px 14px', fontSize: '11px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: chip.dot, display: 'inline-block' }} />
                {t('plans.chip.' + chip.slug)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 1-ON-1 */}
      <section id="1on1" style={{ scrollMarginTop: '90px', padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SectionEyebrow>{t('plans.private.eyebrow')}</SectionEyebrow>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,2.5vw,32px)', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>{t('plans.private.title')}</h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', marginBottom: '8px' }}>{t('plans.private.meta')}</p>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: '560px', marginBottom: '36px' }}>
            {t('plans.private.desc')}
          </p>
          {/* Four stacked cards made this page enormously long on a phone. Below md
              the row swipes sideways instead (see .pkg-row in globals.css); each card
              takes 78% of the width so the next one peeks in and shows it scrolls. */}
          <div className="pkg-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {PRIVATE_PACKAGES.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} accentColor={GOLD} />)}
          </div>
        </div>
      </section>

      <div style={{ background: '#f0f4f8', position: 'relative' }}>
        <svg viewBox="0 0 1440 40" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ display: 'block', width: '100%', marginTop: '-1px' }}>
          <path d="M0,20 C480,40 960,0 1440,20 L1440,0 L0,0 Z" fill={DARK} />
        </svg>
      </div>

      {/* 1-ON-2 */}
      <section id="1on2" style={{ scrollMarginTop: '90px', background: '#f0f4f8', padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SectionEyebrow dark>{t('plans.semi.eyebrow')}</SectionEyebrow>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,2.5vw,32px)', fontWeight: 900, color: NAVY, marginBottom: '6px' }}>{t('plans.semi.title')}</h2>
          <p style={{ fontSize: '14px', color: '#8a9ab8', marginBottom: '8px' }}>{t('plans.semi.meta')}</p>
          <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.7, maxWidth: '560px', marginBottom: '36px' }}>
            {t('plans.semi.desc')}
          </p>
          <div className="pkg-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {SEMI_PACKAGES.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} accentColor="#4a90c4" />)}
          </div>
        </div>
      </section>

      <div style={{ background: DARK, position: 'relative' }}>
        <svg viewBox="0 0 1440 40" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ display: 'block', width: '100%', marginTop: '-1px' }}>
          <path d="M0,20 C480,0 960,40 1440,20 L1440,0 L0,0 Z" fill="#f0f4f8" />
        </svg>
      </div>

      {/* GROUP + SWIM TEAM */}
      <section id="1on4" style={{ scrollMarginTop: '90px', background: DARK, padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '28px' }}>
            <div style={{ background: NAVY, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', padding: '36px 32px' }}>
              <SectionEyebrow>{t('plans.group.eyebrow')}</SectionEyebrow>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(20px,2.2vw,28px)', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>{t('plans.group.title')}</h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>{t('plans.group.meta')}</p>
              <p style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, marginBottom: '28px' }}>
                {t('plans.group.desc')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {GROUP_OPTIONS.map((opt) => (
                  <div key={opt.id} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>{t('plans.pkg.sessions', { n: opt.sessions })}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{t('plans.group.perSessionValidity', { price: opt.perSession, n: opt.validityMonths })}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 900, color: '#4caf72', lineHeight: 1 }}>${opt.price}</div>
                        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>{t('plans.pkg.total')}</div>
                        {opt.savings ? <div style={{ fontSize: '11px', fontWeight: 600, color: '#3a9a5c', marginTop: '2px' }}>{t('plans.pkg.save', { amount: opt.savings })}</div> : null}
                      </div>
                    </div>
                    <GetStartedButton accentColor="#4caf72" isFeatured={true} labelKey="plans.btn.enroll" planId={opt.id} />
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: '16px' }}>
                {t('plans.group.note')}
              </p>
            </div>

            <div style={{ background: NAVY, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', padding: '36px 32px' }}>
              <SectionEyebrow>{t('plans.team.eyebrow')}</SectionEyebrow>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(20px,2.2vw,28px)', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>{t('plans.team.title')}</h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>{t('plans.team.meta')}</p>
              <p style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, marginBottom: '28px' }}>
                {t('plans.team.desc')}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
                {['feat1', 'feat2', 'feat3', 'feat4'].map((feat) => (
                  <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e05a4a', flexShrink: 0, display: 'inline-block' }} />
                    {t('plans.team.' + feat)}
                  </div>
                ))}
              </div>
              <TeamTierList />
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: '16px' }}>
                {t('plans.team.note')}
              </p>
              <GetStartedButton accentColor="#e05a4a" isFeatured={true} labelKey="plans.btn.joinTeam" planId="team" />
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON NOTE */}
      <section style={{ background: DARK, padding: '0 clamp(24px,5vw,72px) clamp(48px,6vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', background: NAVY, borderRadius: '16px', border: `1px solid ${GOLD_BORDER}`, padding: 'clamp(24px,3vw,36px) clamp(24px,4vw,48px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '24px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>{t('plans.compare.eyebrow')}</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(18px,2vw,24px)', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>
              {t('plans.compare.title1')}<br /><em style={{ color: GOLD }}>{t('plans.compare.title2')}</em>
            </div>
          </div>
          {[
            { slug: 'fastest', chip: 'private' },
            { slug: 'value', chip: 'semi' },
            { slug: 'social', chip: 'group' },
            { slug: 'competitive', chip: 'team' },
          ].map((item) => (
            <div key={item.slug} style={{ borderLeft: `2px solid ${GOLD_BORDER}`, paddingLeft: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>{t('plans.compare.label.' + item.slug)}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{t('plans.chip.' + item.chip)}</div>
            </div>
          ))}
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
            {t('plans.cta.desc')}
          </p>
          <GetStartedButton accentColor={GOLD} isFeatured={true} labelKey="plans.btn.createAccount" planId="" />
        </div>
      </section>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      </div>
    </div>
  )
}
