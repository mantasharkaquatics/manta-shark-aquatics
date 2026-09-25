'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'

import { LEVEL_COLORS, stageNameKey } from '@/lib/levels'
import { stageColor, mixHex, onColor } from '@/lib/ribbons'
import StageRibbon from '@/components/StageRibbon'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

/* goalCount must match the number of levels.N.goal.M keys in the locale files.
   Those goals are written by hand -- they are the promise the page makes to a
   parent -- so whenever the curriculum changes, they have to be rewritten and
   this count checked. They went stale once already: the page was still offering
   treading water and a clothed swim months after both were taken out. */
const levels = [
  { num: 1, color: LEVEL_COLORS['1'], goalCount: 5 },
  { num: 2, color: LEVEL_COLORS['2'], goalCount: 6 },
  { num: 3, color: LEVEL_COLORS['3'], goalCount: 6 },
  { num: 4, color: LEVEL_COLORS['4'], goalCount: 6 },
  { num: 5, color: LEVEL_COLORS['5'], goalCount: 6 },
  { num: 6, color: LEVEL_COLORS['6'], goalCount: 6 },
  { num: 7, color: LEVEL_COLORS['7'], goalCount: 6 },
]

// Every level is taught in three stages. A family sees which one their swimmer
// is in on their dashboard; here they can see what all three cover.
const STAGES = [1, 2, 3] as const

// Palette B (2026-09). The level colours stay exactly as they are: they are the
// colours of the ribbons a swimmer earns, so the page shows them unchanged and
// keeps everything around them in the site's navy and white.
const css = `
  .l-desk { display: grid; grid-template-columns: 270px 1fr; gap: 24px; align-items: start; }
  .l-nav { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 18px; padding: 10px; display: flex; flex-direction: column; gap: 4px;
           position: sticky; top: 88px; }
  .l-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; border: 0; background: transparent;
            cursor: pointer; width: 100%; text-align: left; font-family: inherit; color: ${BRAND.ink}; transition: background 0.15s; }
  .l-item:hover { background: ${BRAND.paper}; }
  .l-item[aria-current="true"] { background: ${BRAND.navy}; color: #fff; }
  .l-disc { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 800; flex-shrink: 0; }
  .l-item[aria-current="true"] .l-disc { box-shadow: 0 0 0 2px #fff; }
  /* minWidth 0 lets the name wrap inside the button instead of running past
     it: "Independent Movement" and "Competitive Swimming" are wider than the column. */
  .l-names { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
  .l-names small { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: ${BRAND.mute}; }
  .l-item[aria-current="true"] .l-names small { color: rgba(255,255,255,0.6); }
  .l-names span { font-size: 14px; font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
  .l-chev { margin-left: auto; flex-shrink: 0; font-size: 16px; color: #b8c4d6; }
  .l-item[aria-current="true"] .l-chev { color: ${BRAND.yellow}; }

  .l-head { border-radius: 18px; padding: 28px 34px; position: relative; overflow: hidden; margin-bottom: 20px; }
  .l-head::after { content: ''; position: absolute; right: -30px; top: -30px; width: 150px; height: 150px; border-radius: 50%;
                   background: rgba(255,255,255,0.1); pointer-events: none; }
  .l-head small { font-size: 11px; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; opacity: 0.72; }
  .l-head h2 { font-size: 34px; font-weight: 900; margin-top: 6px; }
  .l-body { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 18px; padding: 30px 34px; }
  .l-tag { font-size: 17px; font-weight: 700; color: ${BRAND.navy}; line-height: 1.5; margin: 0 0 10px; }
  .l-desc { font-size: 15px; color: ${BRAND.mute}; line-height: 1.8; margin: 0 0 22px; padding-bottom: 22px; border-bottom: 1px solid ${BRAND.line}; }
  .l-stages { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 24px; }
  .l-stage { border: 1px solid rgba(0,0,0,0.06); border-radius: 10px; padding: 12px 14px; position: relative; overflow: hidden; min-height: 72px; }
  .l-stage small { display: block; font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 4px; }
  .l-stage div { font-size: 13.5px; font-weight: 700; color: ${BRAND.navy}; line-height: 1.35; padding-right: 36px; }
  .l-goalh { font-size: 14px; font-weight: 800; color: ${BRAND.navy}; margin: 0 0 12px; }
  .l-goals { list-style: none; display: flex; flex-direction: column; gap: 11px; padding: 0; margin: 0; }
  .l-goals li { display: flex; align-items: flex-start; gap: 12px; font-size: 15px; color: ${BRAND.ink}; line-height: 1.65; }
  .l-goals li i { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; margin-top: 8px; }

  .l-mob { display: none; flex-direction: column; gap: 8px; }
  .l-acc { border-radius: 14px; overflow: hidden; background: #fff; border: 1px solid ${BRAND.line}; }
  .l-acc > button { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 0; background: transparent; cursor: pointer;
                    width: 100%; text-align: left; font-family: inherit; color: ${BRAND.ink}; }
  .l-acc .l-chev { transition: transform 0.25s; }
  .l-acc[data-open="true"] .l-chev { transform: rotate(90deg); color: ${BRAND.blue}; }
  .l-acc-body { padding: 4px 16px 20px; }
  .l-acc-body .l-tag { font-size: 15px; }
  .l-acc-body .l-desc { font-size: 14px; margin-bottom: 16px; padding-bottom: 16px; }
  .l-acc-body .l-stages { gap: 7px; margin-bottom: 16px; }
  .l-acc-body .l-stage { padding: 9px 10px; min-height: 0; }
  .l-acc-body .l-stage div { font-size: 12px; padding-right: 0; }
  .l-acc-body .l-goals li { font-size: 14px; }

  .l-final-p { font-size: 16px; }
  .l-final-p strong { color: #fff; font-weight: 700; }
  .l-note { font-size: 13px !important; color: rgba(255,255,255,0.55) !important; margin-top: 14px !important; }

  @media (max-width: 768px) {
    .l-desk { display: none; }
    .l-mob { display: flex; }
  }
`

export default function LevelsContent() {
  const t = useT()
  const locale = useLocale()
  const [activeLevel, setActiveLevel] = useState(0)
  const [openAccordion, setOpenAccordion] = useState<number | null>(null)

  const current = levels[activeLevel]

  // Plain render helpers (called, not mounted) so switching level does not
  // remount the ribbons.
  function stages(num: number, ribbons: boolean) {
    return (
      <div className="l-stages">
        {STAGES.map(st => {
          /* Each stage wears its own ribbon's colour, so the three cards read
             as three different prizes rather than three slices of the same
             level. The tint is the ribbon mixed far into white; the eyebrow
             and the top rule are the ribbon itself. */
          const rc = stageColor(num, st)
          return (
            <div key={st} className="l-stage" style={{ background: mixHex(rc, '#ffffff', 0.9), borderTop: `3px solid ${rc}` }}>
              <small style={{ color: mixHex(rc, '#000000', 0.34) }}>{t('dash.stageN', { n: st })}</small>
              <div>{t(stageNameKey(num, st))}</div>
              {ribbons && (
                <span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>
                  <StageRibbon level={num} stage={st} size={38} label={t(stageNameKey(num, st))} />
                </span>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  function goals(lv: typeof levels[number]) {
    return (
      <>
        <p className="l-goalh">{t('levels.goalsHeading')}</p>
        <ul className="l-goals">
          {Array.from({ length: lv.goalCount }, (_, k) => k + 1).map(g => (
            <li key={g}><i style={{ background: lv.color }} />{t('levels.' + lv.num + '.goal.' + g)}</li>
          ))}
        </ul>
      </>
    )
  }

  return (
    <BrandRoot>
      <style>{css}</style>

      {/* ── HERO ── */}
      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">{t('levels.hero.eyebrow')}</p>
          <h1>{t('levels.hero.title1')}<br /><em>{t('levels.hero.title2')}</em></h1>
          <p className="b-lead">{t('levels.hero.subtitle')}</p>
          {/* Where a level comes from. Without this the seven levels read as a
              chart to self-diagnose against; they are handed out, not chosen. */}
          <p className="b-lead" style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', marginTop: 12 }}>
            {t('levels.assessFirst.body')}{' '}
            <Link href={localePath('/assessment', locale)} style={{ color: BRAND.yellow, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
              {t('levels.assessFirst.cta')}
            </Link>
          </p>
          <div className="b-chips">
            {['structure', 'progression', 'allAges'].map(slug => <span key={slug}>{t('levels.chip.' + slug)}</span>)}
          </div>
        </div>
      </header>

      <section className="b-sec b-paper" style={{ paddingTop: 48, paddingBottom: 72 }}>
        <div className="b-wrap">
          {/* ── DESKTOP: list on the left, the chosen level on the right ── */}
          <div className="l-desk">
            <nav className="l-nav" aria-label={t('levels.hero.eyebrow')}>
              {levels.map((lv, i) => (
                <button key={lv.num} type="button" className="l-item" aria-current={activeLevel === i} onClick={() => setActiveLevel(i)}>
                  {/* Not always white: on the yellows white scored 1.7:1. The
                      ink is picked from the disc's own luminance. */}
                  <span className="l-disc" style={{ background: lv.color, color: onColor(lv.color) }}>{lv.num}</span>
                  <span className="l-names">
                    <small>{t('levels.levelN', { n: lv.num })}</small>
                    <span>{t('level.' + lv.num + '.name')}</span>
                  </span>
                  <span className="l-chev" aria-hidden="true">›</span>
                </button>
              ))}
            </nav>

            <div>
              <div className="l-head" style={{ background: current.color, color: onColor(current.color) }}>
                <small>{t('levels.levelN', { n: current.num })}</small>
                <h2>{t('level.' + current.num + '.name')}</h2>
              </div>
              <div className="l-body">
                <p className="l-tag">{t('levels.' + current.num + '.tagline')}</p>
                <p className="l-desc">{t('levels.' + current.num + '.desc')}</p>
                {stages(current.num, true)}
                {goals(current)}
              </div>
            </div>
          </div>

          {/* ── PHONE: one card per level, opened in place ── */}
          <div className="l-mob">
            {levels.map((lv, i) => {
              const open = openAccordion === i
              return (
                <div key={lv.num} className="l-acc" data-open={open}>
                  <button type="button" aria-expanded={open} onClick={() => setOpenAccordion(open ? null : i)}>
                    <span className="l-disc" style={{ background: lv.color, color: onColor(lv.color), width: 32, height: 32 }}>{lv.num}</span>
                    <span className="l-names">
                      <small>{t('levels.levelN', { n: lv.num })}</small>
                      <span>{t('level.' + lv.num + '.name')}</span>
                    </span>
                    <span className="l-chev" aria-hidden="true">›</span>
                  </button>
                  {open && (
                    <div className="l-acc-body">
                      <p className="l-tag">{t('levels.' + lv.num + '.tagline')}</p>
                      <p className="l-desc">{t('levels.' + lv.num + '.desc')}</p>
                      {stages(lv.num, false)}
                      {goals(lv)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA ── */}
      <section className="b-final">
        <div className="b-wrap" style={{ maxWidth: 820 }}>
          <p className="b-eyebrow" style={{ color: BRAND.yellow, marginBottom: 12 }}>{t('levels.cta.eyebrow')}</p>
          <h2>{t('levels.cta.title1')}<br /><em>{t('levels.cta.title2')}</em></h2>
          {/* p1 and p2 are two halves of ONE sentence -- p1b ends "...aquatic
              confidence —" and p2a picks up with a lowercase "our coaches focus
              on". One paragraph. The joining space is conditional: English
              wants one after the em-dash, Chinese ends the first half on a
              full-width punctuation mark that already carries its own. */}
          <p className="l-final-p" style={{ maxWidth: 640 }}>
            {t('levels.cta.p1a')}
            <strong>{t('levels.cta.p1strong')}</strong>
            {t('levels.cta.p1b')}
            {/[　-〿＀-￯]$/.test(t('levels.cta.p1b')) ? '' : ' '}
            {t('levels.cta.p2a')}
            <strong>{t('levels.cta.p2strong')}</strong>
            {t('levels.cta.p2b')}
          </p>
          <div className="b-ctas">
            <Link href="/register" className="b-btn gold">{t('levels.cta.button')}</Link>
          </div>
          <p className="l-note">{t('levels.cta.note')}</p>
        </div>
      </section>
    </BrandRoot>
  )
}
