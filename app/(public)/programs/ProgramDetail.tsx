'use client'

import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'
import WeekPreview from '@/components/programs/WeekPreview'
import { BASE_POINTS } from '@/lib/points'
import ProgramCards from './ProgramCards'

/* One page per programme (owner, 2026-09-28): what the lesson is, what it
   costs, and the open times of THAT kind of lesson over the next seven days.
   Private, group and swim team share this layout; adaptive swim keeps its own
   page because its first step is a conversation, not a time slot. */

export type DetailKind = 'private' | 'group' | 'team'

const css = `
  .pd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .pd-card { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 18px; padding: 26px;
    display: flex; flex-direction: column; }
  .pd-card .k { font-size: 11px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; color: ${BRAND.blue}; }
  .pd-card h3 { font-size: 22px; margin: 6px 0 0; color: ${BRAND.navy}; }
  .pd-card p { color: ${BRAND.mute}; font-size: 14.5px; line-height: 1.65; margin: 10px 0 0; flex: 1; }
  .pd-card .pr { margin-top: 18px; padding-top: 14px; border-top: 1px solid ${BRAND.line};
    display: flex; align-items: baseline; gap: 8px; }
  .pd-card .pr b { font-size: 26px; font-weight: 900; color: ${BRAND.navy}; }
  .pd-card .pr span { font-size: 13px; color: ${BRAND.mute}; }
  .pd-info { background: ${BRAND.paper}; border: 1px dashed #c9d8ee; border-radius: 18px; padding: 26px;
    display: flex; align-items: center; }
  .pd-info p { color: ${BRAND.mute}; font-size: 14.5px; line-height: 1.7; margin: 0; }
  .pd-feats { margin: 14px 0 0; padding-left: 18px; color: ${BRAND.mute}; font-size: 14.5px; line-height: 1.9; }
  .pd-meta { font-size: 13px; font-weight: 700; color: ${BRAND.mute}; margin-top: 12px; }
  .pd-anchor { scroll-margin-top: 90px; }
  @media (max-width: 900px) { .pd-grid { grid-template-columns: 1fr; } }
`

export default function ProgramDetail({ kind }: { kind: DetailKind }) {
  const t = useT()
  const locale = useLocale()
  const P = `programs.${kind}`

  const card = (slug: '1on1' | '1on2' | '1on4', key: 'private' | 'semi' | 'group', unit: string) => (
    <div className="pd-card">
      <div className="k">{t(`home.program.${key}.kind`)}</div>
      <h3>{t(`home.program.${key}.name`)}</h3>
      <p>{t(`home.program.${key}.desc`)}</p>
      <div className="pr"><b>${BASE_POINTS[slug]}</b><span>{t(unit)}</span></div>
    </div>
  )

  const chips: string[] =
    kind === 'private' ? [t('levels.chip.ages3'), `${t('home.program.private.name')} · $${BASE_POINTS['1on1']}`, `${t('home.program.semi.name')} · $${BASE_POINTS['1on2']}`]
    : kind === 'group' ? [t('levels.chip.ages3'), `${t('home.program.group.name')} · $${BASE_POINTS['1on4']}`, t('programs.group.chip')]
    : [t('programs.team.chipLevel'), t('programs.team.chip90'), t('home.program.monthly')]

  return (
    <BrandRoot>
      <style>{css}</style>

      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">
            <Link href={localePath('/programs', locale)} style={{ color: 'inherit', textDecoration: 'none' }}>{t('adapt.crumb')}</Link>
            <span aria-hidden="true" style={{ opacity: .6, margin: '0 8px' }}>/</span>
            {t(`nav.prog.${kind}`)}
          </p>
          <h1>{t(`${P}.title1`)}<br /><em>{t(`${P}.title2`)}</em></h1>
          <p className="b-lead">{t(`${P}.lead`)}</p>
          <div className="b-chips">
            {chips.map(c => <span key={c}>{c}</span>)}
          </div>
          <div className="b-ctas">
            {kind === 'team'
              ? <Link className="b-btn gold" href={localePath('/plans', locale) + '#team'}>{t('programs.team.join')} →</Link>
              : <Link className="b-btn gold" href={localePath('/assessment', locale)}>{t('assess.hero.cta')} →</Link>}
            <a className="b-btn ghost" href="#times">{t('programs.week.jump')}</a>
          </div>
        </div>
      </header>

      <section className="b-sec b-paper">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t(`nav.prog.${kind}Sub`)}</p>
            <h2>{t(`${P}.whatTitle`)}</h2>
            <p>{t(`${P}.sub`)}</p>
          </div>
          {kind === 'private' && (
            <div className="pd-grid">
              {card('1on1', 'private', 'home.program.per30')}
              {card('1on2', 'semi', 'home.program.perSwimmer')}
            </div>
          )}
          {kind === 'group' && (
            <div className="pd-grid">
              {card('1on4', 'group', 'home.program.perSwimmer')}
              <div className="pd-info"><p>{t('programs.group.bands')}</p></div>
            </div>
          )}
          {kind === 'team' && (
            <div className="pd-card">
              <div className="k">{t('plans.team.eyebrow')}</div>
              <h3>{t('plans.team.title')}</h3>
              <p>{t('plans.team.desc')}</p>
              <ul className="pd-feats">
                {[1, 2, 3, 4].map(n => <li key={n}>{t('plans.team.feat' + n)}</li>)}
              </ul>
              <div className="pd-meta">{t('plans.team.meta')} · {t('home.program.monthly')}</div>
            </div>
          )}
        </div>
      </section>

      <section id="times" className="b-sec pd-anchor">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('programs.week.eyebrow')}</p>
            <h2>{t(`programs.week.title.${kind}`)}</h2>
            <p>{t(kind === 'team' ? 'programs.week.subTeam' : kind === 'group' ? 'programs.week.subGroup' : 'programs.week.sub')}</p>
          </div>
          <WeekPreview kind={kind} />
        </div>
      </section>

      <section className="b-sec b-paper">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('programs.hero.eyebrow')}</p>
            <h2>{t('programs.more.title')}</h2>
          </div>
          <ProgramCards except={kind} />
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
