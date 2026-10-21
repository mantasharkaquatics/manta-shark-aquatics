'use client'

import { useEffect, useState } from 'react'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

/* Refunds a person has to send (owner, 2026-10-14): the part of a refund a
   family paid in cash at the desk, waiting for someone to give it to them --
   and, since 2026-10-21, the part paid by Zelle, which a manager checks and
   sends back by Zelle. Each row says which. Renders nothing while the list is
   empty, so the Sales page looks as it always did. */

type Item = { id: string; createdAt: string; parentId: string; family: string; amount: number; note: string | null; method: 'cash' | 'zelle' }

export default function HandBackList() {
  const t = useT()
  const locale = useLocale()
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Item | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    const res = await fetch('/api/admin/refund/hand-back').catch(() => null)
    const d = res?.ok ? await res.json().catch(() => null) : null
    if (d?.items) setItems(d.items)
  }
  useEffect(() => { load() }, [])

  async function markHanded(item: Item) {
    setConfirm(null); setBusy(item.id); setErr(null)
    const res = await fetch('/api/admin/refund/hand-back', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id }),
    }).catch(() => null)
    setBusy(null)
    if (!res?.ok && res?.status !== 409) { setErr(t('admin.handBack.err')); return }
    load()
  }

  if (items.length === 0) return null
  const total = items.reduce((a, i) => a + i.amount, 0)
  const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <section aria-labelledby="hand-back-title" className="bg-amber-500/10 border border-amber-400/40 rounded-xl p-4 mb-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h2 id="hand-back-title" className="text-amber-200 font-semibold">{t('admin.handBack.title', { n: items.length })}</h2>
        <span className="text-amber-200 font-semibold tabular-nums">{money(total)}</span>
      </div>
      <p className="text-amber-100/70 text-xs mb-3">{t('admin.handBack.hint')}</p>
      {err && <p role="alert" className="text-red-400 text-xs mb-2">{err}</p>}
      <div className="space-y-2">
        {items.map(i => (
          <div key={i.id} className="flex flex-wrap items-center gap-3 bg-[#111d38] border border-[#1e3a6e] rounded-lg px-3 py-2 text-sm">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${i.method === 'zelle' ? 'border-violet-400/60 text-violet-300' : 'border-amber-400/60 text-amber-200'}`}>
              {i.method === 'zelle' ? t('admin.handBack.method.zelle') : t('admin.handBack.method.cash')}
            </span>
            <span className="text-white font-medium">{i.family || '—'}</span>
            <span className="text-amber-200 tabular-nums font-semibold">{money(i.amount)}</span>
            {i.note && <span className="text-gray-400 text-xs truncate max-w-[280px]" title={i.note}>{i.note}</span>}
            <span className="text-gray-500 text-xs ml-auto">
              {new Date(i.createdAt).toLocaleDateString(dateTag(locale, 'en-US'), { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' })}
            </span>
            <button onClick={() => setConfirm(i)} disabled={busy === i.id}
              className="text-xs px-3 py-1.5 rounded border border-emerald-400/50 text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-40">
              {i.method === 'zelle' ? t('admin.handBack.markZelle') : t('admin.handBack.mark')}
            </button>
          </div>
        ))}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirm(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="hand-back-confirm"
            className="bg-[#1a2744] border border-[#1e3a6e] rounded-xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 id="hand-back-confirm" className="text-white font-semibold text-lg mb-3">
              {confirm.method === 'zelle'
                ? t('admin.handBack.confirmTitleZelle', { amount: money(confirm.amount), family: confirm.family })
                : t('admin.handBack.confirmTitle', { amount: money(confirm.amount), family: confirm.family })}
            </h3>
            <p className="text-gray-400 text-xs mb-4">{t('admin.handBack.confirmBody')}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirm(null)} className="text-xs px-4 py-2 rounded border border-[#1e3a6e] text-gray-300 hover:bg-white/5">{t('common.cancel')}</button>
              <button onClick={() => markHanded(confirm)} className="text-xs px-4 py-2 rounded bg-emerald-500/80 text-white font-semibold hover:bg-emerald-500">{confirm.method === 'zelle' ? t('admin.handBack.markZelle') : t('admin.handBack.mark')}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
