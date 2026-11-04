'use client'

import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { BRAND } from '@/lib/brand'

/* The four programmes as link cards, in the order of the Programs menu. The
   overview page shows all four; each programme page shows the other three. */

export const PROGRAMS = [
  { key: 'private', href: '/programs/private' },
  { key: 'group', href: '/programs/group' },
  { key: 'adaptive', href: '/adaptive-swim' },
  { key: 'team', href: '/programs/team' },
] as const
export type ProgramKey = typeof PROGRAMS[number]['key']

const css = `
  .pc-grid { display: grid; grid-template-columns: repeat(var(--pc-cols, 4), minmax(0, 1fr)); gap: 14px; }
  .pc { position: relative; background: #fff; border: 1px solid ${BRAND.line}; border-radius: 16px; padding: 22px;
    display: flex; flex-direction: column; color: inherit; transition: border-color .15s, transform .15s; }
  .pc:hover { border-color: ${BRAND.blue}; transform: translateY(-2px); }
  .pc:has(.pc-main:focus-visible) { outline: 3px solid ${BRAND.yellow}; outline-offset: 2px; }
  /* The whole card opens the programme (the title link's area covers it);
     看價格 sits above that area (owner, 2026-11-04, 問題 10 選項 A). */
  .pc-main { color: inherit; text-decoration: none; outline: none; }
  .pc-main::after { content: ''; position: absolute; inset: 0; border-radius: 16px; }
  .pc-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
  .pc-price { position: relative; z-index: 1; display: inline-flex; align-items: center; min-height: 38px; padding: 0 14px; border-radius: 10px;
    background: ${BRAND.amber}; color: ${BRAND.navy}; font-size: 13.5px; font-weight: 800; text-decoration: none; }
  .pc-price:hover { background: ${BRAND.amberHover}; }
  .pc-price:focus-visible { outline: 3px solid ${BRAND.yellow}; outline-offset: 2px; }
  .pc .k { font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: ${BRAND.blue}; }
  .pc h3 { font-size: 20px; margin: 6px 0 0; color: ${BRAND.navy}; }
  .pc p { color: ${BRAND.mute}; font-size: 14px; line-height: 1.65; margin: 8px 0 0; flex: 1; }
  .pc .go { font-size: 14px; font-weight: 800; color: ${BRAND.blue}; }
  @media (max-width: 1024px) { .pc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 620px) { .pc-grid { grid-template-columns: 1fr; } }
  @media (prefers-reduced-motion: reduce) { .pc, .pc:hover { transition: none; transform: none; } }
`

export default function ProgramCards({ except }: { except?: ProgramKey }) {
  const t = useT()
  const locale = useLocale()
  const list = PROGRAMS.filter(p => p.key !== except)
  return (
    <>
      <style>{css}</style>
      <div className="pc-grid" style={{ ['--pc-cols' as string]: list.length } as React.CSSProperties}>
        {list.map(p => (
          <div key={p.key} className="pc">
            <div className="k">{t(`nav.prog.${p.key}Sub`)}</div>
            <h3><Link className="pc-main" href={localePath(p.href, locale)}>{t(`nav.prog.${p.key}`)}</Link></h3>
            <p>{t(`programs.${p.key}.sub`)}</p>
            <div className="pc-foot">
              <span className="go" aria-hidden="true">{t(p.key === 'adaptive' ? 'programs.card.more' : 'programs.card.cta')} →</span>
              <Link className="pc-price" href={localePath('/plans', locale) + (p.key === 'team' ? '#team' : '#buy')}>{t('programs.card.seePrice')} →</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
