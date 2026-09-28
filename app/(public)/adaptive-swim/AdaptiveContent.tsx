'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { openChat } from '@/lib/chat-open'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

/* Adaptive swim: lessons for children with special needs (owner, 2026-09-28).
   The advantage is the founder -- Mitzi is a school psychologist as well as
   a former national-team swimmer (her district is not named, owner 2026-09-28)
   -- and the school is
   a Regional Center of Orange County vendor. Same lessons, same price, one
   coach; the difference is how they are taught.

   Every enquiry goes through the chat, where the assistant explains the
   programme and gathers what the team needs before handing over (see the
   ADAPTIVE SWIM section of lib/ai/policies.ts). The chat is for signed-in
   families, so a visitor is sent to make a free account first and comes back
   here with the chat already open (?chat=1). */

const css = `
  .ad-stat { display: grid; grid-template-columns: 240px 1fr; gap: 36px; align-items: center; }
  .ad-big { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 18px; padding: 26px 20px; text-align: center; }
  .ad-big b { display: block; font-size: 58px; line-height: 1; font-weight: 900; color: ${BRAND.amber}; }
  .ad-big span { display: block; margin-top: 10px; font-size: 13px; line-height: 1.5; color: ${BRAND.mute}; white-space: pre-line; }

  .ad-two { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 48px; align-items: start; }
  .ad-facts { background: ${BRAND.navy}; color: #fff; border-radius: 20px; padding: 32px; }
  .ad-facts small { display: block; font-size: 11px; letter-spacing: .16em; font-weight: 800; color: ${BRAND.yellow}; text-transform: uppercase; }
  .ad-facts strong { display: block; font-size: 28px; font-weight: 900; margin: 6px 0 18px; }
  .ad-facts ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
  .ad-facts li { display: flex; gap: 12px; font-size: 16px; font-weight: 700; line-height: 1.45; }
  .ad-facts li::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: ${BRAND.yellow}; flex-shrink: 0; margin-top: 8px; }

  .ad-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .ad-steps .b-card b { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%;
    background: ${BRAND.navy}; color: #fff; font-size: 14px; margin-bottom: 12px; }
  .ad-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

  .ad-fund { background: ${BRAND.navy}; color: #fff; border-radius: 20px; padding: 34px 38px;
    display: grid; grid-template-columns: 1.25fr 1fr; gap: 32px; align-items: center; }
  .ad-fund h3 { font-size: 24px; font-weight: 900; margin: 0; }
  .ad-fund p { color: rgba(255,255,255,.82); font-size: 15px; line-height: 1.75; margin: 12px 0 0; }
  .ad-fund ul { margin: 0; padding-left: 18px; color: rgba(255,255,255,.88); font-size: 15px; line-height: 1.95; }

  .ad-faq { max-width: 760px; border-top: 1px solid ${BRAND.line}; }
  .ad-faq div { padding: 18px 0; border-bottom: 1px solid ${BRAND.line}; }
  .ad-faq h3 { font-size: 16.5px; color: ${BRAND.navy}; margin: 0; }
  .ad-faq p { color: ${BRAND.mute}; font-size: 15px; line-height: 1.75; margin: 6px 0 0; }

  @media (max-width: 900px) {
    .ad-stat, .ad-two, .ad-fund { grid-template-columns: 1fr; gap: 24px; }
    .ad-steps { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 560px) {
    .ad-steps, .ad-grid { grid-template-columns: 1fr; }
    .ad-fund { padding: 26px; }
    .ad-facts { padding: 26px; }
  }
`

export default function AdaptiveContent() {
  const t = useT()
  const locale = useLocale()
  // The chat is open to everyone now (owner, 2026-09-28), so the button opens
  // it with the adaptive-swim question in the box. ?chat=1 still arrives from
  // older sign-up links and opens it the same way.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('chat') === '1') openChat(t('adapt.chatSeed'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const chatBtn = (cls: string) => (
    <button type="button" className={'b-btn ' + cls} onClick={() => openChat(t('adapt.chatSeed'))}>{t('adapt.cta.chat')} →</button>
  )

  return (
    <BrandRoot>
      <style>{css}</style>

      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">
            <Link href={localePath('/programs', locale)} style={{ color: 'inherit', textDecoration: 'none' }}>{t('adapt.crumb')}</Link>
            <span aria-hidden="true" style={{ opacity: .6, margin: '0 8px' }}>/</span>
            {t('adapt.hero.eyebrow')}
          </p>
          <h1>{t('adapt.hero.title1')}<br /><em>{t('adapt.hero.title2')}</em></h1>
          <p className="b-lead">{t('adapt.hero.sub')}</p>
          <div className="b-chips">
            <span>{t('levels.chip.ages3')}</span>
            <span>{t('adapt.chip.one')}</span>
            <span>{t('adapt.chip.price')}</span>
            <span className="hi">{t('adapt.chip.rc')}</span>
          </div>
          <div className="b-ctas">
            {chatBtn('gold')}
            <Link className="b-btn ghost" href={localePath('/plans', locale)}>{t('adapt.cta.prices')}</Link>
          </div>
        </div>
      </header>

      <section className="b-sec">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('adapt.why.eyebrow')}</p>
            <h2>{t('adapt.why.title')}</h2>
          </div>
          <div className="ad-stat">
            <div className="ad-big"><b>{t('adapt.why.big')}</b><span>{t('adapt.why.stat')}</span></div>
            <div>
              <p className="b-body" style={{ marginTop: 0 }}>{t('adapt.why.body')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="b-sec b-paper">
        <div className="b-wrap ad-two">
          <div className="ad-facts">
            <small>{t('adapt.mitzi.eyebrow')}</small>
            <strong>Mitzi</strong>
            <ul>
              <li>{t('adapt.mitzi.f1')}</li>
              <li>{t('adapt.mitzi.f2')}</li>
              <li>{t('adapt.mitzi.f3')}</li>
            </ul>
          </div>
          <div>
            <h2 className="b-h2" style={{ marginTop: 0 }}>{t('adapt.mitzi.title')}</h2>
            <p className="b-body">{t('adapt.mitzi.p1')}</p>
            <p className="b-body">{t('adapt.mitzi.p2')}</p>
          </div>
        </div>
      </section>

      <section className="b-sec">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('adapt.how.eyebrow')}</p>
            <h2>{t('adapt.how.title')}</h2>
          </div>
          <div className="ad-steps">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="b-card">
                <b>{n}</b>
                <h3>{t('adapt.how.s' + n + '.title')}</h3>
                <p>{t('adapt.how.s' + n + '.text')}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="b-sec b-paper">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('adapt.adj.eyebrow')}</p>
            <h2>{t('adapt.adj.title')}</h2>
          </div>
          <div className="ad-grid">
            {['routine', 'entry', 'sensory', 'positive'].map(k => (
              <div key={k} className="b-card">
                <h3>{t('adapt.adj.' + k + '.title')}</h3>
                <p>{t('adapt.adj.' + k + '.text')}</p>
              </div>
            ))}
          </div>
          <p className="b-body" style={{ marginTop: 22 }}>{t('adapt.adj.honest')}</p>
        </div>
      </section>

      <section className="b-sec">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('adapt.fund.eyebrow')}</p>
            <h2>{t('adapt.fund.title')}</h2>
          </div>
          <div className="ad-fund">
            <div>
              <h3>{t('adapt.fund.rcTitle')}</h3>
              <p>{t('adapt.fund.rcBody')}</p>
            </div>
            <ul>
              <li>{t('adapt.fund.l1')}<Link href={localePath('/plans', locale)} style={{ color: BRAND.yellow, fontWeight: 800 }}>{t('page.plans')}</Link></li>
              <li>{t('adapt.fund.l3')}</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="b-sec b-paper">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('adapt.faq.eyebrow')}</p>
            <h2>{t('adapt.faq.title')}</h2>
          </div>
          <div className="ad-faq">
            {[1, 2, 3, 4].map(n => (
              <div key={n}>
                <h3>{t('adapt.faq.q' + n)}</h3>
                <p>{t('adapt.faq.a' + n)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="b-final">
        <div className="b-wrap">
          <h2>{t('adapt.final.title')}</h2>
          <p>{t('adapt.final.body')}</p>
          <div className="b-ctas">{chatBtn('gold')}</div>
        </div>
      </section>

    </BrandRoot>
  )
}
