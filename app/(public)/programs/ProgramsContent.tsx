'use client'

import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'
import { BASE_POINTS } from '@/lib/points'

/* Every programme on one page (owner, 2026-09-28). The top bar used to name
   Adaptive Swim on its own, which could read as "a special-needs swim school";
   the bar now says Programs and lands here, and adaptive swim is one card of
   five -- a branch, not the whole tree. Prices come from lib/points, the same
   numbers the booking page charges. */

const css = `
  .pg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .pg-card { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 18px; padding: 26px;
    display: flex; flex-direction: column; }
  .pg-card .k { font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: ${BRAND.blue}; }
  .pg-card h3 { font-size: 22px; margin: 6px 0 0; color: ${BRAND.navy}; }
  .pg-card p { color: ${BRAND.mute}; font-size: 14.5px; line-height: 1.65; margin: 10px 0 0; flex: 1; }
  .pg-card .pr { margin-top: 18px; padding-top: 14px; border-top: 1px solid ${BRAND.line};
    display: flex; align-items: baseline; gap: 8px; }
  .pg-card .pr b { font-size: 26px; font-weight: 900; color: ${BRAND.navy}; }
  .pg-card .pr span { font-size: 13px; color: ${BRAND.mute}; }

  .pg-wide { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
  .pg-feature { border-radius: 20px; padding: 30px 32px; display: flex; flex-direction: column; }
  .pg-feature .k { font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
  .pg-feature h3 { font-size: 26px; margin: 8px 0 0; }
  .pg-feature p { font-size: 15px; line-height: 1.7; margin: 10px 0 0; flex: 1; }
  .pg-feature .meta { font-size: 13px; font-weight: 700; margin-top: 12px; }
  .pg-feature .b-btn { align-self: flex-start; margin-top: 22px; }
  .pg-team { background: #fff; border: 1px solid ${BRAND.line}; }
  .pg-team .k { color: ${BRAND.blue}; } .pg-team h3 { color: ${BRAND.navy}; }
  .pg-team p, .pg-team .meta { color: ${BRAND.mute}; }
  .pg-adapt { background: ${BRAND.navy}; color: #fff; }
  .pg-adapt .k { color: ${BRAND.yellow}; }
  .pg-adapt p { color: rgba(255,255,255,.82); }
  .pg-adapt .meta { color: ${BRAND.yellow}; }

  @media (max-width: 900px) {
    .pg-grid { grid-template-columns: 1fr; }
    .pg-wide { grid-template-columns: 1fr; }
  }
  @media (max-width: 560px) { .pg-feature { padding: 26px; } }
`

export default function ProgramsContent() {
  const t = useT()
  const locale = useLocale()

  const lessons = [
    { slug: 'private', price: BASE_POINTS['1on1'], unit: 'home.program.per30' },
    { slug: 'semi', price: BASE_POINTS['1on2'], unit: 'home.program.perSwimmer' },
    { slug: 'group', price: BASE_POINTS['1on4'], unit: 'home.program.perSwimmer' },
  ] as const

  return (
    <BrandRoot>
      <style>{css}</style>

      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">{t('programs.hero.eyebrow')}</p>
          <h1>{t('programs.hero.title1')}<br /><em>{t('programs.hero.title2')}</em></h1>
          <p className="b-lead">{t('programs.hero.sub')}</p>
          <div className="b-ctas">
            <Link className="b-btn gold" href={localePath('/assessment', locale)}>{t('assess.hero.cta')} →</Link>
            <Link className="b-btn ghost" href={localePath('/plans', locale)}>{t('adapt.cta.prices')}</Link>
          </div>
        </div>
      </header>

      <section className="b-sec b-paper">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('programs.lessons.eyebrow')}</p>
            <h2>{t('programs.lessons.title')}</h2>
            <p>{t('home.programs.sub')}</p>
          </div>
          <div className="pg-grid">
            {lessons.map(l => (
              <div key={l.slug} className="pg-card">
                <div className="k">{t(`home.program.${l.slug}.kind`)}</div>
                <h3>{t(`home.program.${l.slug}.name`)}</h3>
                <p>{t(`home.program.${l.slug}.desc`)}</p>
                <div className="pr"><b>${l.price}</b><span>{t(l.unit)}</span></div>
              </div>
            ))}
          </div>

          <div className="pg-wide">
            <div className="pg-feature pg-team">
              <div className="k">{t('plans.team.eyebrow')}</div>
              <h3>{t('plans.team.title')}</h3>
              <p>{t('plans.team.desc')}</p>
              <div className="meta">{t('plans.team.meta')} · {t('home.program.monthly')}</div>
              <Link className="b-btn line" href={localePath('/plans', locale) + '#team'}>{t('programs.team.cta')} →</Link>
            </div>
            <div className="pg-feature pg-adapt">
              <div className="k">{t('adapt.home.eyebrow')}</div>
              <h3>{t('adapt.home.title')}</h3>
              <p>{t('adapt.home.body')}</p>
              <div className="meta">{t('levels.chip.ages3')} · {t('adapt.chip.one')} · {t('adapt.chip.price')}</div>
              <Link className="b-btn gold" href={localePath('/adaptive-swim', locale)}>{t('adapt.home.cta')} →</Link>
            </div>
          </div>
          <p className="b-body" style={{ marginTop: 22 }}>{t('home.programs.note')}</p>
        </div>
      </section>

      <section className="b-final">
        <div className="b-wrap">
          <h2>{t('programs.final.title')}</h2>
          <p>{t('programs.final.body')}</p>
          <div className="b-ctas">
            <Link className="b-btn gold" href={localePath('/assessment', locale)}>{t('assess.hero.cta')} →</Link>
          </div>
        </div>
      </section>
    </BrandRoot>
  )
}
