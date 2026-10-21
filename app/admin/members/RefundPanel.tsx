'use client'

import { useEffect, useState } from 'react'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

/* Refunding a family's purchased points (owner, 2026-10-14). Shown inside the
   family's Points section, to the owner's account only: /api/admin/refund
   answers 403 to everyone else and this renders nothing.

   Preview first, always. While CASH_REFUND_ENABLED is off (until the lawyer has
   approved the terms) the preview still works, so the screen and its figures
   can be checked, and the confirm button stays disabled. Money goes back the
   way it came: card and bank payments through Stripe, desk cash in cash --
   which then waits on the Sales page's "cash to hand back" list. */

type Leg = {
  purchaseId: string
  paymentIntentId: string | null
  paidAt: string | null
  cents: number
  feeNotReturnedCents: number | null
  paidWith: string | null
}

type Plan = {
  walletRefundableCents: number
  chargesRefundableCents: number
  maxRefundCents: number
  requestedCents: number
  legs: Leg[]
  stripeCents: number
  manualCents: number
  feeNotReturnedCents: number
  feesIncomplete: boolean
  enabled: boolean
}

type Result = { refunded: number; handBack: number; failed: number }

const money = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function RefundPanel({ parentId, onDone }: { parentId: string; onDone: () => void }) {
  const t = useT()
  const locale = useLocale()
  const [owner, setOwner] = useState<{ enabled: boolean } | null>(null)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    let live = true
    fetch('/api/admin/refund?probe=1').then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => { if (live && d?.owner) setOwner({ enabled: !!d.enabled }) })
    return () => { live = false }
  }, [])

  if (!owner) return null

  const where = (l: Leg) => {
    // A desk Zelle sale has no payment intent either; it goes back by Zelle,
    // by hand, like desk cash goes back by hand.
    if (!l.paymentIntentId) return l.paidWith === 'zelle' ? t('admin.refund.to.zelle') : t('admin.refund.to.cash')
    if (l.paidWith === 'us_bank_account') return t('admin.refund.to.bank')
    if (l.paidWith === 'card_present' || l.paidWith === 'stripe_terminal') return t('admin.refund.to.terminal')
    return t('admin.refund.to.card')
  }

  const errorText = (code: string, message: string | undefined, blankAmount: boolean) =>
    code === 'WALLET_IN_ARREARS' ? t('admin.refund.err.arrears')
    : code === 'ABOVE_REFUNDABLE' ? t('admin.refund.err.above', { max: (message || '').replace(/^.*\$/, '$').replace(/\.$/, '') })
    : code === 'INVALID_AMOUNT' ? (blankAmount ? t('admin.refund.err.nothing') : t('admin.refund.err.amount'))
    : code === 'REFUNDS_NOT_ENABLED' ? t('admin.refund.notEnabled')
    : code === 'PAYMENT_LOOKUP_FAILED' ? t('admin.refund.err.lookup')
    : t('admin.refund.err.failed')

  async function preview() {
    setBusy(true); setErr(null); setPlan(null); setResult(null)
    const q = new URLSearchParams({ parent_id: parentId })
    if (amount.trim()) q.set('amount', amount.trim())
    const res = await fetch('/api/admin/refund?' + q.toString()).catch(() => null)
    const d = res ? await res.json().catch(() => null) : null
    setBusy(false)
    if (!res || !res.ok || !d) { setErr(errorText(String(d?.error || ''), d?.message, !amount.trim())); return }
    setPlan(d as Plan)
  }

  async function execute() {
    if (!plan) return
    setConfirming(false); setBusy(true); setErr(null)
    const res = await fetch('/api/admin/refund', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent_id: parentId, amount: plan.requestedCents / 100, note: note.trim() }),
    }).catch(() => null)
    const d = res ? await res.json().catch(() => null) : null
    setBusy(false)
    if (!res) { setErr(t('admin.refund.err.unsure')); onDone(); return }
    if (!res.ok || !d?.ok) { setErr(errorText(String(d?.error || ''), d?.message, false)); return }
    setResult({ refunded: d.refunded, handBack: d.handBack, failed: d.failed })
    setPlan(null); setAmount(''); setNote('')
    onDone()
  }

  const close = () => { setOpen(false); setPlan(null); setErr(null); setResult(null) }
  const noteOk = note.trim().length >= 3

  return (
    <div className="border border-red-400/20 rounded-lg p-3 space-y-3">
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="text-xs px-3 py-1 rounded border border-red-400/50 text-red-300 hover:bg-red-400/10">
          {t('admin.refund.open')}
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-red-300 text-xs font-semibold tracking-wide">{t('admin.refund.title')}</p>
            <button onClick={close} className="text-gray-500 text-xs hover:text-gray-300">{t('common.cancel')}</button>
          </div>
          {!owner.enabled && <p className="text-amber-300/90 text-xs">{t('admin.refund.offNote')}</p>}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-400 text-xs">$</span>
            <input type="number" min={1} step={1} inputMode="numeric" value={amount}
              onChange={e => { setAmount(e.target.value); setPlan(null) }}
              placeholder={t('admin.refund.amountPh')} aria-label={t('admin.refund.amountPh')}
              className="w-32 bg-transparent border border-[#1e3a6e] rounded px-2 py-1 text-gray-300 text-xs" />
            <input type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder={t('admin.refund.reasonPh')} aria-label={t('admin.refund.reasonPh')}
              className="flex-1 min-w-[180px] bg-transparent border border-[#1e3a6e] rounded px-2 py-1 text-gray-300 text-xs" />
            <button onClick={preview} disabled={busy}
              className="text-xs px-3 py-1 rounded border border-[#1e3a6e] text-gray-300 hover:border-[#c9a84c]/50 hover:text-[#c9a84c] disabled:opacity-40">
              {busy && !plan ? t('common.loading') : t('admin.refund.preview')}
            </button>
          </div>
          <p className="text-gray-500 text-xs">{t('admin.refund.hint')}</p>

          {err && <p role="alert" className="text-red-400 text-xs">{err}</p>}
          {result && (
            <p role="status" className="text-emerald-300 text-xs">
              {t('admin.refund.done', { amount: money(Math.round(result.refunded * 100)) })}
              {result.handBack > 0 && ' ' + t('admin.refund.doneCash', { amount: money(Math.round(result.handBack * 100)) })}
              {result.failed > 0 && ' ' + t('admin.refund.doneFailed', { amount: money(Math.round(result.failed * 100)) })}
            </p>
          )}

          {plan && (
            <div className="space-y-2">
              <p className="text-gray-400 text-xs">
                {t('admin.refund.max', {
                  max: money(plan.maxRefundCents),
                  wallet: money(plan.walletRefundableCents),
                  charges: money(plan.chargesRefundableCents),
                })}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-500 text-left">
                      <th className="font-normal py-1 pr-3">{t('admin.refund.col.paid')}</th>
                      <th className="font-normal py-1 pr-3">{t('admin.refund.col.to')}</th>
                      <th className="font-normal py-1 pr-3 text-right">{t('admin.refund.col.amount')}</th>
                      <th className="font-normal py-1 text-right">{t('admin.refund.col.fee')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.legs.map(l => (
                      <tr key={l.purchaseId} className="border-t border-[#1e3a6e]/60 text-gray-300">
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {l.paidAt ? new Date(l.paidAt).toLocaleDateString(dateTag(locale, 'en-US'), { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                        </td>
                        <td className="py-1.5 pr-3">{where(l)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{money(l.cents)}</td>
                        <td className="py-1.5 text-right tabular-nums text-gray-500">{l.feeNotReturnedCents == null ? '?' : money(l.feeNotReturnedCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="border border-[#1e3a6e] rounded px-3 py-2">
                  <p className="text-gray-500">{t('admin.refund.sum.stripe')}</p>
                  <p className="text-white tabular-nums font-semibold">{money(plan.stripeCents)}</p>
                </div>
                <div className={`border rounded px-3 py-2 ${plan.manualCents > 0 ? 'border-amber-400/50' : 'border-[#1e3a6e]'}`}>
                  <p className="text-gray-500">{t('admin.refund.sum.cash')}</p>
                  <p className={`tabular-nums font-semibold ${plan.manualCents > 0 ? 'text-amber-300' : 'text-white'}`}>{money(plan.manualCents)}</p>
                </div>
                <div className="border border-[#1e3a6e] rounded px-3 py-2">
                  <p className="text-gray-500">{t('admin.refund.sum.fee')}</p>
                  <p className="text-white tabular-nums font-semibold">{money(plan.feeNotReturnedCents)}{plan.feesIncomplete ? '+' : ''}</p>
                </div>
              </div>
              {plan.feesIncomplete && <p className="text-gray-500 text-xs">{t('admin.refund.feesIncomplete')}</p>}
              {plan.legs.some(l => l.paidWith === 'us_bank_account') && <p className="text-gray-500 text-xs">{t('admin.refund.bankNote')}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setConfirming(true)} disabled={busy || !plan.enabled || !noteOk}
                  className="text-xs px-4 py-1.5 rounded bg-red-500/70 text-white font-semibold hover:bg-red-500 disabled:opacity-40 disabled:hover:bg-red-500/70">
                  {t('admin.refund.confirmBtn', { amount: money(plan.requestedCents) })}
                </button>
                {!plan.enabled
                  ? <span className="text-amber-300/90 text-xs">{t('admin.refund.notEnabled')}</span>
                  : !noteOk && <span className="text-gray-500 text-xs">{t('admin.refund.needReason')}</span>}
              </div>
            </div>
          )}
        </>
      )}

      {confirming && plan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirming(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="refund-confirm-title"
            className="bg-[#1a2744] border border-[#1e3a6e] rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 id="refund-confirm-title" className="text-white font-semibold text-lg mb-3">
              {t('admin.refund.confirmTitle', { amount: money(plan.requestedCents) })}
            </h3>
            <div className="text-xs text-gray-400 space-y-1 mb-4">
              <p>{t('admin.refund.confirmStripe', { amount: money(plan.stripeCents) })}</p>
              {plan.manualCents > 0 && <p className="text-amber-300">{t('admin.refund.confirmCash', { amount: money(plan.manualCents) })}</p>}
              <p>{t('admin.refund.confirmPoints', { n: (plan.requestedCents / 100).toLocaleString() })}</p>
              <p>{t('admin.refund.confirmReason', { note: note.trim() })}</p>
              <p className="text-gray-500">{t('admin.refund.confirmEmail')}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirming(false)} className="text-xs px-4 py-2 rounded border border-[#1e3a6e] text-gray-300 hover:bg-white/5">{t('common.cancel')}</button>
              <button onClick={execute} className="text-xs px-4 py-2 rounded bg-red-500/80 text-white font-semibold hover:bg-red-500">{t('admin.refund.confirmGo')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
