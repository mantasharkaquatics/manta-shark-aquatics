'use client'

import { useState, type CSSProperties } from 'react'
import { useT } from '@/lib/i18n/provider'
import { MIN_TOPUP_DOLLARS } from '@/lib/points'

/* Pay off arrears by card (owner, 2026-10-08): exactly what is owed, or the
   minimum top-up when less is owed -- the rest stays as purchased points.
   It used to send the family to the pricing page, where the smallest thing on
   offer was a $400 pack. The server works the amount out again from the
   wallet; `owed` is only for the label. One point is one dollar. */
export default function SettleArrearsButton({ owed, style, className }: { owed: number; style?: CSSProperties; className?: string }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pay = Math.max(Math.ceil(owed), MIN_TOPUP_DOLLARS)

  async function settle() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settleArrears: true }),
      })
      const j = await res.json().catch(() => ({}))
      if (j.url) { window.location.href = j.url; return }
      setErr(t('points.buy.err.generic'))
    } catch {
      setErr(t('points.buy.err.generic'))
    }
    setBusy(false)
  }

  return (
    <div>
      <button type="button" onClick={settle} disabled={busy} className={className} style={style}>
        {busy ? '…' : t('points.card.arrearsCta', { amount: pay.toLocaleString('en-US') })}
      </button>
      {pay > owed && (
        <div style={{ fontSize: '12px', color: '#56647d', lineHeight: 1.5, marginTop: '8px' }}>
          {t('points.card.arrearsMin', { min: MIN_TOPUP_DOLLARS, extra: (pay - Math.ceil(owed)).toLocaleString('en-US') })}
        </div>
      )}
      {err && <div role="alert" style={{ fontSize: '12px', color: '#c0392b', marginTop: '8px' }}>{err}</div>}
    </div>
  )
}
