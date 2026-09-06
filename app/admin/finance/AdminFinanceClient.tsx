'use client'

import { useEffect, useState } from 'react'

type Month = {
  month: string; earned: number; topUpCash: number; refundCash: number
  purchasedIn: number; purchasedOut: number; granted: number
}
type Data = {
  today: string
  liability: {
    refundable: number; unearnedBooked: number; deferredTotal: number
    granted: number; paidCents: number; refundedCents: number
  }
  months: Month[]
}

const GOLD = '#c9a84c'
const money = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// One point is one dollar, so a point total IS a dollar total. Printed with the
// dollar sign because this page is read by an accountant, not a parent.
const pts = (n: number) => '$' + n.toLocaleString('en-US')

function Card({ label, value, note, accent }: { label: string; value: string; note: string; accent?: boolean }) {
  return (
    <div style={{ background: '#111d38', border: `1px solid ${accent ? GOLD + '66' : 'rgba(255,255,255,0.08)'}`, borderRadius: 12, padding: '18px 20px' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent ? GOLD : '#fff', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.45)', marginTop: 8, lineHeight: 1.6 }}>{note}</div>
    </div>
  )
}

export default function AdminFinanceClient() {
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch('/api/admin/finance')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(setD)
      .catch(() => setErr('Could not load the figures. Reload the page.'))
  }, [])

  if (err) return <p style={{ color: '#ff9d8f' }}>{err}</p>
  if (!d) return <p style={{ color: 'rgba(255,255,255,0.5)' }}>Loading…</p>

  const L = d.liability
  const th: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '10px', fontSize: 13.5, color: 'rgba(255,255,255,0.85)', fontVariantNumeric: 'tabular-nums', borderTop: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Deferred revenue</h1>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13.5, marginBottom: 24, maxWidth: 760, lineHeight: 1.7 }}>
        Money a family puts in is not revenue — it is cash plus a promise to teach.
        It becomes revenue on the day the lesson happens. As of {d.today}.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 16 }}>
        <Card accent label="Deferred revenue" value={pts(L.deferredTotal)}
          note="What you still owe in lessons. This is the liability line." />
        <Card label="— unspent in wallets" value={pts(L.refundable)}
          note="Refundable in cash on request, with no deadline. Do not spend it as if it were yours." />
        <Card label="— booked, not yet taught" value={pts(L.unearnedBooked)}
          note="Already deducted from a wallet, but the lesson has not happened. Still owed." />
        <Card label="Granted points outstanding" value={pts(L.granted)}
          note="Given, never sold. Not a refund liability and never cash — a discount, not deferred revenue." />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 28 }}>
        <Card label="Cash taken, all time" value={money(L.paidCents)} note="Every top-up ever settled." />
        <Card label="Cash refunded, all time" value={money(L.refundedCents)} note="Returned to families." />
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 10 }}>By month</h2>
      <div style={{ overflowX: 'auto', background: '#111d38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Month</th>
              <th style={th}>Revenue earned</th>
              <th style={th}>Cash in</th>
              <th style={th}>Cash refunded</th>
              <th style={th}>Points sold</th>
              <th style={th}>Points spent</th>
            </tr>
          </thead>
          <tbody>
            {d.months.length === 0 && (
              <tr><td style={{ ...td, textAlign: 'left', color: 'rgba(255,255,255,0.4)' }} colSpan={6}>Nothing yet.</td></tr>
            )}
            {d.months.map(m => (
              <tr key={m.month}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#fff' }}>{m.month}</td>
                <td style={{ ...td, color: GOLD, fontWeight: 700 }}>{pts(m.earned)}</td>
                <td style={td}>{money(m.topUpCash)}</td>
                <td style={td}>{m.refundCash ? money(m.refundCash) : '—'}</td>
                <td style={td}>{pts(m.purchasedIn)}</td>
                <td style={td}>{pts(m.purchasedOut)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 10, background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.22)', fontSize: 12.5, lineHeight: 1.8, color: 'rgba(255,255,255,0.65)', maxWidth: 820 }}>
        <strong style={{ color: '#fff' }}>For the accountant.</strong> &ldquo;Revenue earned&rdquo; is on an accrual
        basis: a lesson counts in the month it was taught, no-shows included, because a no-show
        consumes the lesson and the points are not returned. &ldquo;Cash in&rdquo; is what actually
        settled through Stripe or the desk that month — if the business files on a cash basis, that
        is the column that matters. One point is one dollar throughout. Points given as a grant are
        excluded from the liability: they were never cash and can never be refunded as cash.
      </div>
    </div>
  )
}
