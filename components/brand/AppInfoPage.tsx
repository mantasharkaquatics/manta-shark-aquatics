'use client'

import { useSyncExternalStore } from 'react'
import { appLook } from '@/lib/native-app'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

/* The school's own pages as app screens (owner, 2026-11-03, 版本一): 「我的」
   keeps its five rows -- programmes, levels, FAQ, about, policies -- and each
   opens a short page in the app's look instead of the website's: no dark
   hero, no big pictures, no closing "book an assessment" band. The title and
   the content on the app's pale blue, white cards, the app's own top bar
   (with its back arrow) and tabs around it. The website keeps its full pages.

   useAppLook: true inside the app. False on the server and the website. */

const noSubscribe = () => () => {}
export const useAppLook = () => useSyncExternalStore(noSubscribe, appLook, () => false)

const css = `
  .ai { padding: 14px 16px 24px; max-width: 640px; margin: 0 auto; }
  html.msa-app body:has(.ai), html.msa-app body:has(.ai) .rn-space, html.msa-app .b-root:has(.ai) { background: #e9eff7; }
  .ai h1 { font-size: 24px; font-weight: 800; color: ${BRAND.navy}; margin: 0 0 4px; line-height: 1.3; }
  /* No subtitle: the same room under the title as a subtitle leaves (50-role test). */
  .ai h1:not(:has(+ .ai-sub)) { margin-bottom: 14px; }
  .ai-sub { font-size: 14px; color: ${BRAND.mute}; line-height: 1.6; margin: 0 0 14px; }
  .ai .ai-sec { font-family: inherit; font-size: 13px; font-weight: 800; color: ${BRAND.mute}; margin: 18px 0 8px; }
  .ai-list { display: flex; flex-direction: column; gap: 8px; }
  .ai-card { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px; padding: 14px 16px; }
  .ai .ai-card h2 { font-size: 17px; font-weight: 800; color: ${BRAND.navy}; margin: 0; line-height: 1.35; }
  .ai-card p { font-size: 14px; color: ${BRAND.mute}; line-height: 1.65; margin: 6px 0 0; }
  .ai-card .ai-price { font-size: 14px; font-weight: 800; color: ${BRAND.navy}; margin-top: 10px; }
  /* A page meant to fit one screen does not bounce either. */
  html.msa-app:has(.ai-fit), html.msa-app:has(.ai-fit) body { overscroll-behavior: none; }
  .ai-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 36px; margin-top: 12px; padding: 0 16px;
    border-radius: 10px; border: 0; background: ${BRAND.amber}; color: ${BRAND.navy}; font: inherit; font-size: 14px; font-weight: 800;
    text-decoration: none; cursor: pointer; }
  .ai-btn.ghost { background: #eef3fa; color: ${BRAND.blue}; }
  .ai-btn:focus-visible, .ai-row:focus-visible, .ai-q button:focus-visible { outline: 3px solid ${BRAND.yellow}; outline-offset: 2px; }
  .ai-row { display: flex; align-items: center; gap: 12px; background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px;
    padding: 14px 16px; text-decoration: none; color: ${BRAND.ink}; }
  .ai-row div { flex: 1; min-width: 0; }
  .ai-row b { display: block; font-size: 15.5px; color: ${BRAND.navy}; }
  .ai-row span { display: block; font-size: 13px; color: ${BRAND.mute}; line-height: 1.5; margin-top: 2px; }
  .ai-row i { font-style: normal; font-size: 18px; color: #6b778c; flex-shrink: 0; }
  .ai-q { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px; overflow: hidden; }
  .ai-q button { width: 100%; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 16px;
    border: 0; background: transparent; text-align: left; font: inherit; font-size: 15px; font-weight: 700; color: ${BRAND.ink};
    line-height: 1.5; cursor: pointer; }
  .ai-q button em { font-style: normal; width: 24px; height: 24px; border-radius: 50%; background: #eef3fa; color: ${BRAND.blue};
    display: grid; place-items: center; flex-shrink: 0; font-size: 17px; line-height: 1; transition: transform .15s; }
  .ai-q[data-open="true"] button em { transform: rotate(45deg); background: ${BRAND.navy}; color: #fff; }
  .ai-q p { margin: 0; padding: 0 16px 16px; font-size: 14.5px; line-height: 1.75; color: ${BRAND.mute}; }
  @media (prefers-reduced-motion: reduce) { .ai-q button em { transition: none; } }
`

export default function AppInfoPage({ title, sub, fit = false, children }: { title: string; sub?: React.ReactNode; fit?: boolean; children: React.ReactNode }) {
  return (
    <BrandRoot>
      <style>{css}</style>
      <div className={'ai' + (fit ? ' ai-fit' : '')}>
        <h1>{title}</h1>
        {sub && <p className="ai-sub">{sub}</p>}
        {children}
      </div>
    </BrandRoot>
  )
}
