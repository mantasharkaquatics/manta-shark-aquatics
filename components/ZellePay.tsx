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
 * Styled inline only: it is used on pages with different stylesheets.
 */
export default function ZellePay({ price, style }: { price?: string; style?: React.CSSProperties }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(ZELLE_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch {}
  }
  const fine: React.CSSProperties = { fontSize: 12, color: BRAND.mute, lineHeight: 1.7, margin: 0 }
  return (
    <details className="p-zelle" style={{ marginTop: 18, borderTop: '1px solid rgba(15,30,60,0.12)', paddingTop: 14, ...style }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('points.zelle.title')}</summary>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start', marginTop: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ZELLE_QR_SRC} alt={t('points.zelle.qrAlt', { name: ZELLE_NAME })} width={150} height={199}
          style={{ width: 150, height: 'auto', borderRadius: 8, border: '1px solid rgba(15,30,60,0.12)', background: '#fff' }} />
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <p style={{ ...fine, marginBottom: 4 }}>{t('points.zelle.to')}</p>
          <p style={{ margin: 0, fontWeight: 700 }}>{ZELLE_NAME}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '2px 0 12px' }}>
            <span style={{ wordBreak: 'break-all' }}>{ZELLE_EMAIL}</span>
            <button type="button" onClick={copy}
              style={{ background: 'none', border: 'none', borderBottom: `1.5px solid ${BRAND.amber}`, font: 'inherit', padding: 0, cursor: 'pointer', color: BRAND.blue, fontWeight: 700 }}>
              {copied ? t('points.zelle.copied') : t('points.zelle.copy')}
            </button>
          </div>
          {/* The site's reset removes list markers; these steps are a real order. */}
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6, listStyle: 'decimal' }}>
            <li>{t('points.zelle.step1')}</li>
            {price && <li>{t('points.zelle.step2', { price })}</li>}
            <li>{t('points.zelle.step3')}</li>
            <li>{t('points.zelle.step4')}</li>
          </ol>
          <p style={{ ...fine, marginTop: 10 }}>{t('points.zelle.note')}</p>
        </div>
      </div>
    </details>
  )
}
