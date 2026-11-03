'use client'

import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import BrandRoot from '@/components/brand/BrandRoot'
import ProgramCards from './ProgramCards'
import AppInfoPage, { useAppLook } from '@/components/brand/AppInfoPage'
import { BASE_POINTS } from '@/lib/points'

/* The Programs overview. It used to hold all four programmes in sections; each
   now has its own page with its own open times (owner, 2026-09-28), so this
   page is the map: four cards, one per page, in the order of the menu. Adaptive
   swim is one card of four -- a branch, not the whole tree. */

/* Inside the app (owner, 2026-11-03): the four programmes as cards with what
   each costs and the one thing to do next -- book, ask us, or join the team.
   No per-programme pages: their open times are the 預約 tab itself. */
function ProgramsApp() {
  const t = useT()
  const cards = [
    { key: 'private', price: t('appinfo.price.private', { a: BASE_POINTS['1on1'], b: BASE_POINTS['1on2'] }), href: '/booking', btn: t('nav.bookShort') },
    { key: 'group', price: t('appinfo.price.group', { n: BASE_POINTS['1on4'] }), href: '/booking', btn: t('nav.bookShort') },
    { key: 'adaptive', price: t('appinfo.price.adaptive'), href: '/dashboard/chat', btn: t('dash.up.messageUs'), ghost: true },
    { key: 'team', price: t('appinfo.price.team'), href: '/checkout?plan=team', btn: t('programs.team.join') },
  ]
  return (
    <AppInfoPage title={t('page.programs')}>
      <div className="ai-list">
        {cards.map(c => (
          <div key={c.key} className="ai-card">
            <h2>{t(`nav.prog.${c.key}`)}</h2>
            <p>{t(`programs.${c.key}.sub`)}</p>
            <p className="ai-price">{c.price}</p>
            <Link href={c.href} className={'ai-btn' + (c.ghost ? ' ghost' : '')}>{c.btn}</Link>
          </div>
        ))}
      </div>
    </AppInfoPage>
  )
}

export default function ProgramsContent() {
  return useAppLook() ? <ProgramsApp /> : <ProgramsWeb />
}

function ProgramsWeb() {
  const t = useT()
  const locale = useLocale()

  return (
    <BrandRoot>
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
            <p className="b-eyebrow">{t('programs.hero.eyebrow')}</p>
            <h2>{t('programs.overview.title')}</h2>
            <p>{t('programs.overview.sub')}</p>
          </div>
          <ProgramCards />
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
