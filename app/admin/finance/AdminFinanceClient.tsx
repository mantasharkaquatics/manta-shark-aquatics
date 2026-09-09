'use client'

import { useEffect, useState } from 'react'

type Month = {
  month: string; earned: number; topUpCash: number; refundCash: number
  purchasedIn: number; purchasedOut: number; granted: number
  feeCents: number; netCash: number; feePending: number
}
type Data = {
  today: string
  liability: {
    refundable: number; unearnedBooked: number; deferredTotal: number
    granted: number; paidCents: number; refundedCents: number
    feeCents: number; feePending: number
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
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = () =>
    fetch('/api/admin/finance')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(setD)
      .catch(() => setErr('Could not load the figures. Reload the page.'))

  useEffect(() => { load() }, [])

  const syncFees = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/admin/finance/sync-fees?limit=200', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setSyncMsg(
        j.captured > 0
          ? `Read ${j.captured} payment${j.captured === 1 ? '' : 's'} from Stripe.` +
            (j.stillPending ? ` ${j.stillPending} still settling.` : '')
          : j.stillPending
            ? `Nothing new — ${j.stillPending} payment${j.stillPending === 1 ? '' : 's'} still settling at the bank.`
            : 'Everything is already up to date.'
      )
      await load()
    } catch {
      setSyncMsg('Could not reach Stripe. Try again in a moment.')
    }
    setSyncing(false)
  }

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 10 }}>
        <Card label="Cash taken, all time" value={money(L.paidCents)} note="Every top-up ever settled." />
        <Card label="Cash refunded, all time" value={money(L.refundedCents)} note="Returned to families." />
        <Card label="Stripe fees" value={money(L.feeCents)}
          note={`What Stripe kept, read from the payments themselves — not a rate multiplied out. Never returned on a refund.${L.feePending ? ` ${L.feePending} payment${L.feePending === 1 ? '' : 's'} still settling.` : ''}`} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
        <button
          onClick={syncFees}
          disabled={syncing}
          style={{ padding: '9px 16px', borderRadius: 9, border: `1px solid ${GOLD}66`, background: 'transparent', color: syncing ? 'rgba(255,255,255,0.35)' : GOLD, fontSize: 12.5, fontWeight: 600, cursor: syncing ? 'default' : 'pointer', minHeight: 40 }}>
          {syncing ? 'Reading Stripe…' : 'Update fees from Stripe'}
        </button>
        {syncMsg && <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>{syncMsg}</span>}
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 10 }}>By month</h2>
      <div style={{ overflowX: 'auto', background: '#111d38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Month</th>
              <th style={th}>Revenue earned</th>
              <th style={th}>Cash in</th>
              <th style={th}>Stripe fees</th>
              <th style={th}>Net cash</th>
              <th style={th}>Cash refunded</th>
              <th style={th}>Points sold</th>
              <th style={th}>Points spent</th>
            </tr>
          </thead>
          <tbody>
            {d.months.length === 0 && (
              <tr><td style={{ ...td, textAlign: 'left', color: 'rgba(255,255,255,0.4)' }} colSpan={8}>Nothing yet.</td></tr>
            )}
            {d.months.map(m => (
              <tr key={m.month}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#fff' }}>{m.month}</td>
                <td style={{ ...td, color: GOLD, fontWeight: 700 }}>{pts(m.earned)}</td>
                <td style={td}>{money(m.topUpCash)}</td>
                <td style={{ ...td, color: 'rgba(255,160,150,0.85)' }}>
                  {m.feeCents ? '−' + money(m.feeCents) : '—'}
                  {m.feePending > 0 && (
                    <span title={`${m.feePending} payment(s) still settling — this figure will grow`}
                      style={{ marginLeft: 5, color: 'rgba(255,255,255,0.35)' }}>*</span>
                  )}
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{m.topUpCash ? money(m.netCash) : '—'}</td>
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
        <br /><br />
        <strong style={{ color: '#fff' }}>Stripe fees</strong> come from each payment&rsquo;s own balance
        transaction, so they are what was actually charged rather than a published rate multiplied out —
        bank debits are capped, international cards cost more, the card reader is priced differently again.
        A <span style={{ color: 'rgba(255,255,255,0.85)' }}>*</span> means some payments that month have not
        settled yet and their fees are still to come. Cash taken at the desk carries no fee.
        Note that Stripe does <em>not</em> return the fee when you refund a payment: refunding $650 leaves
        the roughly $19 it cost to collect gone for good.
      </div>
    </div>
  )
}
