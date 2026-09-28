'use client'

import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import BrandRoot from '@/components/brand/BrandRoot'
import ProgramCards from './ProgramCards'

/* The Programs overview. It used to hold all four programmes in sections; each
   now has its own page with its own open times (owner, 2026-09-28), so this
   page is the map: four cards, one per page, in the order of the menu. Adaptive
   swim is one card of four -- a branch, not the whole tree. */

export default function ProgramsContent() {
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
