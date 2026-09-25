'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { createClient } from '@/lib/supabase/client'
import { TRIAL_PRICE_CENTS } from '@/lib/plans'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

/** Booking lives behind the login, so send a signed-out visitor to register
 *  and carry them onward rather than dropping them on a login form with no
 *  explanation of why they are there. */
function BookAssessmentButton({ label }: { label: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    const { data: { user } } = await supabase.auth.getUser()
    router.push(user ? '/booking' : '/register?redirect=/booking')
  }

  return (
    <button type="button" className="b-btn gold" onClick={go} disabled={busy}>
      {busy ? '…' : label}
    </button>
  )
}

// Small line icons for the three "what the level gives you" cards. They are
// three separate benefits, not steps, so they get pictures rather than numbers.
const ICONS: Record<'l1' | 'l2' | 'l3', React.ReactNode> = {
  l1: <path d="M3 20h5v-5h5v-5h5V5h3" />,
  l2: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11" /><circle cx="5" cy="18" r="1.3" /></>,
  l3: <><path d="M4 5h16v11H9l-5 4z" /><path d="M8 9.5h8M8 12.5h5" /></>,
}

export default function AssessmentContent() {
  const t = useT()
  const locale = useLocale()
  const price = '$' + (TRIAL_PRICE_CENTS / 100).toLocaleString()
  const chips = t('assess.hero.meta', { price }).split(' · ')

  return (
    <BrandRoot>
      <style>{`
        .a-what { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: center; }
        .a-why { font-size: 14.5px; color: ${BRAND.mute}; line-height: 1.75; margin: 18px 0 0; max-width: 62ch;
                 padding-top: 18px; border-top: 1px solid ${BRAND.line}; }

        /* The assessment itself, drawn: climb from Level 1 until a level is
           not smooth yet -- that one is where lessons start. */
        .a-ladder { background: ${BRAND.paper}; border: 1px solid ${BRAND.line}; border-radius: 18px; padding: 22px; }
        .a-rung { display: grid; grid-template-columns: 30px 1fr auto; gap: 12px; align-items: center;
                  background: #fff; border: 1px solid ${BRAND.line}; border-radius: 12px; padding: 12px 14px; font-size: 14px; }
        .a-rung + .a-rung { margin-top: 8px; }
        .a-rung i { width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-style: normal;
                    font-weight: 800; font-size: 14px; background: #e6f4ee; color: #1f7a57; }
        .a-rung b { font-weight: 800; }
        .a-rung span { font-size: 12.5px; color: ${BRAND.mute}; text-align: right; }
        .a-rung.stop { background: ${BRAND.navy}; border-color: ${BRAND.navy}; color: #fff; }
        .a-rung.stop i { background: ${BRAND.amber}; color: ${BRAND.navy}; }
        .a-rung.stop span { color: ${BRAND.yellow}; font-weight: 700; }
        .a-rung.skip { background: transparent; border-style: dashed; color: ${BRAND.mute}; }
        .a-rung.skip i { background: transparent; border: 1px dashed ${BRAND.line}; color: ${BRAND.mute}; }
        .a-cap { font-size: 12.5px; color: ${BRAND.mute}; line-height: 1.6; margin: 14px 2px 0; }

        .a-after { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 56px; align-items: start; }
        .a-afterp { margin-top: 28px; }
        .a-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 26px; }
        .a-ico { width: 44px; height: 44px; border-radius: 12px; background: ${BRAND.paper}; border: 1px solid ${BRAND.line};
                 display: grid; place-items: center; margin-bottom: 16px; color: ${BRAND.blue}; }
        .a-first { display: flex; justify-content: space-between; align-items: center; gap: 24px; flex-wrap: wrap; }
        .a-first p { max-width: 58ch; }

        @media (max-width: 900px) {
          .a-what, .a-after { grid-template-columns: 1fr; gap: 32px; }
          .a-cards { grid-template-columns: 1fr; }
          .a-afterp { margin-top: 0; }
        }
      `}</style>

      {/* ── HERO ── */}
      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">{t('assess.hero.eyebrow')}</p>
          <h1>{t('assess.hero.title')}</h1>
          <p className="b-lead">{t('assess.hero.sub')}</p>
          <div className="b-chips">
            {chips.map((c, i) => <span key={i} className={i === chips.length - 1 ? 'hi' : ''}>{c}</span>)}
          </div>
          <div className="b-ctas">
            <BookAssessmentButton label={t('assess.hero.cta')} />
            <Link href={localePath('/levels', locale)} className="b-btn ghost">{t('assess.hero.ctaSecondary')}</Link>
          </div>
        </div>
      </header>

      {/* ── WHAT HAPPENS ── */}
      <section className="b-sec">
        <div className="b-wrap a-what">
          <div>
            <p className="b-eyebrow">{t('assess.what.eyebrow')}</p>
            <h2 className="b-h2">{t('assess.what.title')}</h2>
            <p className="b-body">{t('assess.what.body')}</p>
            <p className="a-why">{t('assess.what.why')}</p>
          </div>
          <div className="a-ladder" aria-hidden="true">
            {[1, 2].map(n => (
              <div key={n} className="a-rung"><i>✓</i><b>{t('assess.ladder.level', { n })}</b><span>{t('assess.ladder.pass')}</span></div>
            ))}
            <div className="a-rung stop"><i>3</i><b>{t('assess.ladder.level', { n: 3 })}</b><span>{t('assess.ladder.stop')}</span></div>
            <div className="a-rung skip"><i>4</i><b>{t('assess.ladder.level', { n: 4 })}</b><span>{t('assess.ladder.skip')}</span></div>
            <p className="a-cap">{t('assess.ladder.caption')}</p>
          </div>
        </div>
      </section>

      {/* ── AFTERWARDS + WHAT THE LEVEL GIVES YOU ── */}
      <section className="b-sec b-paper">
        <div className="b-wrap">
          <div className="a-after" style={{ marginBottom: 48 }}>
            <div>
              <p className="b-eyebrow">{t('assess.after.eyebrow')}</p>
              <h2 className="b-h2">{t('assess.after.title')}</h2>
            </div>
            <p className="b-body a-afterp">{t('assess.after.body')}</p>
          </div>

          <p className="b-eyebrow">{t('assess.next.eyebrow')}</p>
          <h2 className="b-h2" style={{ marginBottom: 28, maxWidth: '24ch' }}>{t('assess.next.title')}</h2>
          <div className="a-cards">
            {(['l1', 'l2', 'l3'] as const).map(k => (
              <div key={k} className="b-card">
                <div className="a-ico">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {ICONS[k]}
                  </svg>
                </div>
                <h3>{t(`assess.next.${k}.title`)}</h3>
                <p>{t(`assess.next.${k}.body`)}</p>
              </div>
            ))}
          </div>
          <Link href={localePath('/levels', locale)} className="b-link">{t('assess.next.levelsLink')}</Link>
        </div>
      </section>

      {/* ── FIRST VISIT ── */}
      <section className="b-sec" style={{ paddingTop: 56, paddingBottom: 56 }}>
        <div className="b-wrap a-first">
          <div>
            <h3 style={{ fontSize: 20 }}>{t('assess.faq.title')}</h3>
            <p className="b-body" style={{ marginTop: 8 }}>{t('assess.faq.body')}</p>
          </div>
          <Link href={localePath('/faq', locale)} className="b-btn line">{t('assess.faq.cta')}</Link>
        </div>
      </section>

      {/* ── CLOSING CTA ── */}
      <section className="b-final">
        <div className="b-wrap">
          <h2>{t('assess.cta.title')}</h2>
          <p>{t('assess.cta.body', { price })}</p>
          <div className="b-ctas"><BookAssessmentButton label={t('assess.cta.button')} /></div>
          <p className="b-small">
            {t('assess.cta.note')}{' '}
            <Link href={localePath('/plans', locale)}>{t('assess.cta.plans')}</Link>
          </p>
        </div>
      </section>
    </BrandRoot>
  )
}
