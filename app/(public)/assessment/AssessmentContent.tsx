'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { createClient } from '@/lib/supabase/client'
import { TRIAL_PRICE_CENTS } from '@/lib/plans'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

/** Booking lives behind the login, so send a signed-out visitor to register
 *  and carry them onward rather than dropping them on a login form with no
 *  explanation of why they are there. */
function BookAssessmentButton({ label, variant = 'solid' }: { label: string; variant?: 'solid' | 'ghost' }) {
  const router = useRouter()
  const supabase = createClient()
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    router.push(user ? '/booking' : '/register?redirect=/booking')
  }

  const solid = variant === 'solid'
  return (
    <button onClick={go} disabled={busy}
      style={{
        padding: '15px 34px', borderRadius: '10px', cursor: busy ? 'wait' : 'pointer',
        background: solid ? GOLD : 'transparent',
        color: solid ? NAVY : '#fff',
        border: solid ? 'none' : '1px solid rgba(255,255,255,0.3)',
        fontSize: '14px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase',
        opacity: busy ? 0.6 : 1,
      }}>
      {busy ? '...' : label}
    </button>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, margin: '0 0 10px' }}>
      {children}
    </p>
  )
}

export default function AssessmentContent() {
  const t = useT()
  const locale = useLocale()
  const price = '$' + (TRIAL_PRICE_CENTS / 100).toLocaleString()

  const h2: React.CSSProperties = {
    fontFamily: "'Playfair Display', serif", fontWeight: 900, color: '#fff',
    fontSize: 'clamp(22px,2.6vw,32px)', lineHeight: 1.25, margin: '0 0 14px',
  }
  const body: React.CSSProperties = {
    fontSize: '15px', lineHeight: 1.85, color: 'rgba(255,255,255,0.72)', margin: '0 0 14px', maxWidth: '62ch',
  }
  const section: React.CSSProperties = { padding: 'clamp(48px,6vw,76px) clamp(24px,5vw,72px)' }
  const inner: React.CSSProperties = { maxWidth: '1000px', margin: '0 auto' }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100vh', background: DARK }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>

      {/* ── HERO ── */}
      <section style={{ background: NAVY, position: 'relative', overflow: 'hidden', padding: 'clamp(80px,10vw,110px) clamp(24px,5vw,72px) clamp(48px,6vw,72px)' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1.5px, transparent 1.5px)', backgroundSize: '22px 22px' }} />
        <div style={{ position: 'absolute', right: '-60px', top: '50%', transform: 'translateY(-50%)', width: 380, height: 380, pointerEvents: 'none' }}>
          {[0, 60, 130].map((inset, i) => (
            <span key={i} style={{ position: 'absolute', borderRadius: '50%', border: `1px solid ${i === 2 ? 'rgba(201,168,76,0.13)' : 'rgba(255,255,255,0.07)'}`, inset }} />
          ))}
        </div>
        <div style={{ ...inner, position: 'relative', zIndex: 1 }}>
          <Eyebrow>{t('assess.hero.eyebrow')}</Eyebrow>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px,3.6vw,46px)', fontWeight: 900, color: '#fff', lineHeight: 1.12, letterSpacing: '-0.5px', margin: '0 0 16px', maxWidth: '18ch', textWrap: 'balance' }}>
            {t('assess.hero.title')}
          </h1>
          <p style={{ ...body, color: 'rgba(255,255,255,0.75)', fontSize: '16px', margin: '0 0 20px' }}>
            {t('assess.hero.sub')}
          </p>
          <p style={{ fontSize: '13px', fontWeight: 600, color: GOLD, letterSpacing: '0.4px', margin: '0 0 28px' }}>
            {t('assess.hero.meta', { price })}
          </p>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <BookAssessmentButton label={t('assess.hero.cta')} />
            <Link href={localePath('/levels', locale)}
              style={{ padding: '15px 34px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', fontSize: '14px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', textDecoration: 'none' }}>
              {t('assess.hero.ctaSecondary')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── WHAT HAPPENS ── */}
      <section style={section}>
        <div style={inner}>
          <Eyebrow>{t('assess.what.eyebrow')}</Eyebrow>
          <h2 style={h2}>{t('assess.what.title')}</h2>
          <p style={body}>{t('assess.what.body')}</p>
          <p style={{ ...body, color: 'rgba(255,255,255,0.5)', fontSize: '14px', margin: 0 }}>{t('assess.what.why')}</p>
        </div>
      </section>

      {/* ── AFTERWARDS ── */}
      <section style={{ ...section, background: NAVY }}>
        <div style={inner}>
          <Eyebrow>{t('assess.after.eyebrow')}</Eyebrow>
          <h2 style={h2}>{t('assess.after.title')}</h2>
          <p style={{ ...body, margin: 0 }}>{t('assess.after.body')}</p>
        </div>
      </section>

      {/* ── WHAT THE LEVEL BUYS YOU ── */}
      <section style={section}>
        <div style={inner}>
          <Eyebrow>{t('assess.next.eyebrow')}</Eyebrow>
          <h2 style={{ ...h2, marginBottom: '28px' }}>{t('assess.next.title')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {(['l1', 'l2', 'l3'] as const).map((k, i) => (
              <div key={k} style={{ background: NAVY, border: '1px solid rgba(255,255,255,0.08)', borderRadius: '16px', padding: '24px 22px' }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '13px', fontWeight: 700, color: GOLD, marginBottom: '10px', letterSpacing: '1px' }}>
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>{t(`assess.next.${k}.title`)}</h3>
                <p style={{ fontSize: '13.5px', lineHeight: 1.75, color: 'rgba(255,255,255,0.6)', margin: 0 }}>{t(`assess.next.${k}.body`)}</p>
              </div>
            ))}
          </div>
          <Link href={localePath('/levels', locale)} style={{ fontSize: '14px', fontWeight: 700, color: GOLD, textDecoration: 'none' }}>
            {t('assess.next.levelsLink')}
          </Link>
        </div>
      </section>

      {/* ── CLOSING CTA ── */}
      <section style={{ ...section, background: NAVY, textAlign: 'center' }}>
        <div style={{ maxWidth: '620px', margin: '0 auto' }}>
          <h2 style={{ ...h2, marginBottom: '12px' }}>{t('assess.cta.title')}</h2>
          <p style={{ ...body, margin: '0 auto 24px', color: 'rgba(255,255,255,0.6)' }}>{t('assess.cta.body', { price })}</p>
          <BookAssessmentButton label={t('assess.cta.button')} />
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: '26px 0 6px' }}>{t('assess.cta.note')}</p>
          <Link href={localePath('/plans', locale)} style={{ fontSize: '13px', fontWeight: 700, color: GOLD, textDecoration: 'none' }}>
            {t('assess.cta.plans')}
          </Link>
        </div>
      </section>
    </div>
  )
}
