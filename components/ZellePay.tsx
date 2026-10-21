'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'
import { ZELLE_EMAIL, ZELLE_NAME, ZELLE_QR_SRC } from '@/lib/zelle'

/**
 * "Or pay by Zelle" (owner, 2026-10-21). Zelle is cash sent remotely: nothing
 * here is automatic, the front desk adds the points by hand once the bank has
 * the money (app/admin/zelle). Callers show it only to a family with an
 * assessed swimmer -- the same families the card checkout sells points to.
 *
 * `price` is the amount picked on the Points page. The dashboard's points
 * sheet has nothing picked, and the family types the amount into their bank's
 * Zelle anyway (owner), so it leaves the amount step out.
 *
 * Laid out for the narrowest place it lives (the dashboard's points sheet,
 * ~430px): QR beside who to pay, the email on its own row with Copy beside
 * it, the steps full width underneath. The email only breaks at the @. Styles are scoped to the `zp-` classes below so the
 * component reads the same on both pages.
 */
const CSS = `
.zp { margin-top: 16px; border: 1px solid #dbe4f0; border-radius: 12px; background: #f7faff; }
.zp > summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 10px; padding: 12px 14px; font-weight: 700; font-size: 14px; color: ${BRAND.navy}; }
.zp > summary::-webkit-details-marker { display: none; }
.zp > summary:focus-visible { outline: 3px solid ${BRAND.amber}; outline-offset: 2px; border-radius: 12px; }
.zp-mark { flex: none; width: 26px; height: 26px; border-radius: 7px; background: #6d1ed4; color: #fff; display: grid; place-items: center; font-size: 15px; font-weight: 800; }
.zp-chev { margin-left: auto; transition: transform .2s; color: ${BRAND.mute}; }
.zp[open] .zp-chev { transform: rotate(180deg); }
.zp-body { padding: 2px 14px 14px; }
.zp-top { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 12px 14px; align-items: center; background: #fff; border: 1px solid #e3eaf4; border-radius: 10px; padding: 12px; }
.zp-qr { width: 112px; height: auto; display: block; border-radius: 6px; }
.zp-label { font-size: 11px; letter-spacing: .06em; color: ${BRAND.mute}; margin: 0 0 2px; }
.zp-name { font-size: 15px; font-weight: 800; color: ${BRAND.navy}; margin: 0; line-height: 1.3; }
.zp-email { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; min-width: 0; padding-top: 10px; border-top: 1px solid #eef2f8; }
.zp-email span { flex: 1 1 auto; min-width: 0; font-size: 13.5px; font-weight: 600; color: ${BRAND.navy};  line-height: 1.45; }
.zp-copy { flex: none; font: inherit; font-size: 12px; font-weight: 700; color: ${BRAND.blue}; background: #eef3fb; border: 1px solid #cfdcef; border-radius: 999px; padding: 4px 10px; cursor: pointer; }
.zp-copy[data-done="1"] { color: #1f7a57; background: #e6f4ee; border-color: #b7e0cc; }
.zp-steps { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 10px; }
.zp-steps li { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 10px; align-items: start; font-size: 13.5px; line-height: 1.55; color: #26324a; }
.zp-steps b { width: 22px; height: 22px; border-radius: 50%; background: ${BRAND.navy}; color: #fff; display: grid; place-items: center; font-size: 11.5px; font-weight: 700; margin-top: 1px; }
.zp-note { margin: 12px 0 0; padding-top: 10px; border-top: 1px dashed #d5deeb; font-size: 12px; line-height: 1.6; color: ${BRAND.mute}; }
@media (max-width: 360px) { .zp-top { grid-template-columns: 1fr; justify-items: center; text-align: center; } .zp-email { justify-content: center; } }
@media (prefers-reduced-motion: reduce) { .zp-chev { transition: none; } }
`

export default function ZellePay({ price, style }: { price?: string; style?: React.CSSProperties }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(ZELLE_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }
  const steps = [t('points.zelle.step1'), ...(price ? [t('points.zelle.step2', { price })] : []), t('points.zelle.step3'), t('points.zelle.step4')]
  return (
    <details className="zp p-zelle" style={style}>
      <style>{CSS}</style>
      <summary>
        <span className="zp-mark" aria-hidden="true">Z</span>
        <span>{t('points.zelle.title')}</span>
        <svg className="zp-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </summary>
      <div className="zp-body">
        <div className="zp-top">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="zp-qr" src={ZELLE_QR_SRC} alt={t('points.zelle.qrAlt', { name: ZELLE_NAME })} width={112} height={149} />
          <div style={{ minWidth: 0 }}>
            <p className="zp-label">{t('points.zelle.to')}</p>
            <p className="zp-name">{ZELLE_NAME}</p>
          </div>
          {/* Full width under both, so the whole address fits on a phone. */}
          <div className="zp-email">
            {/* Breaks only at the @ on a narrow phone, never mid-word. */}
            <span>{ZELLE_EMAIL.split('@')[0]}@<wbr />{ZELLE_EMAIL.split('@')[1]}</span>
            <button type="button" className="zp-copy" onClick={copy} data-done={copied ? '1' : undefined} aria-live="polite">
              {copied ? t('points.zelle.copied') : t('points.zelle.copy')}
            </button>
          </div>
        </div>
        <ol className="zp-steps">
          {steps.map((s, i) => <li key={i}><b aria-hidden="true">{i + 1}</b><span>{s}</span></li>)}
        </ol>
        <p className="zp-note">{t('points.zelle.note')}</p>
      </div>
    </details>
  )
}
