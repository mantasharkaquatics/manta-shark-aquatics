'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/provider'

type Month = {
  month: string; earned: number; topUpCash: number; refundCash: number
  purchasedIn: number; purchasedOut: number; granted: number
  cashIn: number; feeCents: number; netCash: number; feePending: number
  sold: number; usedNet: number
}
type Data = {
  today: string
  liability: {
    refundable: number; unearnedBooked: number; voucherOwed: number; vouchersOutstanding: number; deferredTotal: number
    granted: number; paidCents: number; refundedCents: number
    feeCents: number; feePending: number
  }
  months: Month[]
  feesUnavailable: string | null
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
  const t = useT()
  const [d, setD] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  const load = () =>
    fetch('/api/admin/finance')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('load failed'))))
      .then(setD)
      .catch(() => setErr(t('admin.finance.err.load')))

  useEffect(() => { load() }, [])

  const syncFees = async () => {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/admin/finance/sync-fees?limit=200', { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error || 'failed')
      setSyncMsg(
        j.captured > 0
          ? t(j.captured === 1 ? 'admin.finance.sync.read' : 'admin.finance.sync.readPlural', { n: j.captured }) +
            (j.stillPending ? t('admin.finance.sync.stillSettling', { n: j.stillPending }) : '')
          : j.stillPending
            ? t(j.stillPending === 1 ? 'admin.finance.sync.nothingNew' : 'admin.finance.sync.nothingNewPlural', { n: j.stillPending })
            : t('admin.finance.sync.upToDate')
      )
      await load()
    } catch {
      setSyncMsg(t('admin.finance.sync.err'))
    }
    setSyncing(false)
  }

  if (err) return <p style={{ color: '#ff9d8f' }}>{err}</p>
  if (!d) return <p style={{ color: 'rgba(255,255,255,0.5)' }}>{t('common.loading')}</p>

  const L = d.liability
  const th: React.CSSProperties = { textAlign: 'right', padding: '8px 10px', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { textAlign: 'right', padding: '10px', fontSize: 13.5, color: 'rgba(255,255,255,0.85)', fontVariantNumeric: 'tabular-nums', borderTop: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{t('admin.finance.title')}</h1>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13.5, marginBottom: 24, maxWidth: 760, lineHeight: 1.7 }}>
        {t('admin.finance.intro', { date: d.today })}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 16 }}>
        <Card accent label={t('admin.finance.title')} value={pts(L.deferredTotal)}
          note={t('admin.finance.card.deferredNote')} />
        <Card label={t('admin.finance.card.unspent')} value={pts(L.refundable)}
          note={t('admin.finance.card.unspentNote')} />
        <Card label={t('admin.finance.card.booked')} value={pts(L.unearnedBooked)}
          note={t('admin.finance.card.bookedNote')} />
        <Card label={t('admin.finance.card.vouchers')} value={pts(L.voucherOwed)}
          note={t(L.vouchersOutstanding === 1 ? 'admin.finance.card.vouchersNote' : 'admin.finance.card.vouchersNotePlural', { n: L.vouchersOutstanding })} />
        <Card label={t('admin.finance.card.granted')} value={pts(L.granted)}
          note={t('admin.finance.card.grantedNote')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, marginBottom: 10 }}>
        <Card label={t('admin.finance.card.cashTaken')} value={money(L.paidCents)} note={t('admin.finance.card.cashTakenNote')} />
        <Card label={t('admin.finance.card.cashRefunded')} value={money(L.refundedCents)} note={t('admin.finance.card.cashRefundedNote')} />
        <Card label={t('admin.finance.stripeFees')} value={d.feesUnavailable ? '—' : money(L.feeCents)}
          note={d.feesUnavailable
            ? t('admin.finance.card.feesUnavailable')
            : t('admin.finance.card.feesNote') + (L.feePending ? t(L.feePending === 1 ? 'admin.finance.card.feesPending' : 'admin.finance.card.feesPendingPlural', { n: L.feePending }) : '')} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
        <button
          onClick={syncFees}
          disabled={syncing}
          style={{ padding: '9px 16px', borderRadius: 9, border: `1px solid ${GOLD}66`, background: 'transparent', color: syncing ? 'rgba(255,255,255,0.35)' : GOLD, fontSize: 12.5, fontWeight: 600, cursor: syncing ? 'default' : 'pointer', minHeight: 40 }}>
          {syncing ? t('admin.finance.sync.reading') : t('admin.finance.sync.button')}
        </button>
        {syncMsg && <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>{syncMsg}</span>}
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 10 }}>{t('admin.finance.byMonth')}</h2>
      <div style={{ overflowX: 'auto', background: '#111d38', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>{t('admin.finance.col.month')}</th>
              <th style={th}>{t('admin.finance.col.earned')}</th>
              <th style={th}>{t('admin.finance.col.cashIn')}</th>
              <th style={th}>{t('admin.finance.stripeFees')}</th>
              <th style={th}>{t('admin.finance.col.netCash')}</th>
              <th style={th}>{t('admin.finance.col.cashRefunded')}</th>
              <th style={th}>{t('admin.finance.col.pointsSold')}</th>
              <th style={th}>{t('admin.finance.col.pointsUsed')}</th>
            </tr>
          </thead>
          <tbody>
            {d.months.length === 0 && (
              <tr><td style={{ ...td, textAlign: 'left', color: 'rgba(255,255,255,0.4)' }} colSpan={8}>{t('admin.finance.empty')}</td></tr>
            )}
            {d.months.map(m => (
              <tr key={m.month}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600, color: '#fff' }}>{m.month}</td>
                <td style={{ ...td, color: GOLD, fontWeight: 700 }}>{pts(m.earned)}</td>
                <td style={td}>{m.cashIn ? money(m.cashIn) : '—'}</td>
                <td style={{ ...td, color: 'rgba(255,160,150,0.85)' }}>
                  {m.feeCents ? '−' + money(m.feeCents) : '—'}
                  {m.feePending > 0 && (
                    <span title={t('admin.finance.feePendingTip', { n: m.feePending })}
                      style={{ marginLeft: 5, color: 'rgba(255,255,255,0.35)' }}>*</span>
                  )}
                </td>
                <td style={{ ...td, fontWeight: 600 }}>{m.cashIn ? money(m.netCash) : '—'}</td>
                <td style={td}>{m.refundCash ? money(m.refundCash) : '—'}</td>
                <td style={td}>{pts(m.sold)}</td>
                <td style={td}>{pts(m.usedNet)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 10, background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.22)', fontSize: 12.5, lineHeight: 1.8, color: 'rgba(255,255,255,0.65)', maxWidth: 820 }}>
        <strong style={{ color: '#fff' }}>{t('admin.finance.acc.lead')}</strong>{t('admin.finance.acc.body')}
        <br /><br />
        <strong style={{ color: '#fff' }}>{t('admin.finance.stripeFees')}</strong>{t('admin.finance.acc.fees1')}<span style={{ color: 'rgba(255,255,255,0.85)' }}>*</span>{t('admin.finance.acc.fees2')}<em>{t('admin.finance.acc.not')}</em>{t('admin.finance.acc.fees3')}
      </div>
    </div>
  )
}
