'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'
import { ZELLE_EMAIL } from '@/lib/zelle'

type Use = { id: string; amount_cents: number; sale_kind: string; parent_name: string | null; invoice_id: string | null; invoice_number: string | null; created_at: string }
type Receipt = {
  id: string; payer_name: string; amount_cents: number; remaining_cents: number; memo: string | null
  body_excerpt: string | null; received_at: string; verified: boolean; dismissed_at: string | null; dismiss_note: string | null; uses: Use[]
}
type Gmail = { connected: boolean; email?: string; connected_at?: string; last_sync_at?: string | null; last_error?: string | null }
type Data = { receipts: Receipt[]; gmail: Gmail; googleConfigured: boolean; owner: boolean }

const KIND_KEYS: Record<string, string> = {
  points: 'admin.zelle.kind.points', trial: 'admin.zelle.kind.trial', team: 'admin.zelle.kind.team', sdp: 'admin.zelle.kind.sdp',
}
const GMAIL_RESULT_KEYS: Record<string, string> = {
  connected: 'admin.zelle.gmail.result.connected',
  not_owner: 'admin.zelle.gmail.result.notOwner',
  not_configured: 'admin.zelle.gmail.result.notConfigured',
  denied: 'admin.zelle.gmail.result.denied',
  state: 'admin.zelle.gmail.result.state',
  no_refresh: 'admin.zelle.gmail.result.failed',
  scope: 'admin.zelle.gmail.result.scope',
  wrong_mailbox: 'admin.zelle.gmail.result.wrongMailbox',
  save: 'admin.zelle.gmail.result.failed',
  failed: 'admin.zelle.gmail.result.failed',
}

const money = (cents: number) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Zelle payments from the bank's emails, newest first, with what each one
 *  has paid for. "Open" = money the desk has not used yet. */
export default function ZelleClient() {
  const t = useT()
  const locale = useLocale()
  const [data, setData] = useState<Data | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [show, setShow] = useState<'open' | 'all'>('open')
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [gmailResult, setGmailResult] = useState<string | null>(null)

  const when = (iso: string) => new Date(iso).toLocaleString(dateTag(locale), {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
  })

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/zelle?days=120').catch(() => null)
    if (r && r.status === 503) { setLoadError(t('admin.zelle.notInstalled')); return }
    if (!r || !r.ok) { setLoadError(t('admin.zelle.loadFailed')); return }
    setLoadError(null)
    setData(await r.json())
  }, [t])

  useEffect(() => {
    load()
    // Back from Google's consent page: ?gmail=<result>. Shown once, then the
    // address bar is cleaned so a reload does not show it again.
    try {
      const sp = new URLSearchParams(window.location.search)
      const g = sp.get('gmail')
      if (g) {
        setGmailResult(g)
        window.history.replaceState(null, '', window.location.pathname)
      }
    } catch {}
  }, [load])

  const tellSidebar = () => { try { window.dispatchEvent(new Event('admin:zelle-changed')) } catch {} }

  async function syncNow() {
    setSyncing(true); setSyncNote(null)
    const r = await fetch('/api/admin/zelle/sync', { method: 'POST' }).catch(() => null)
    const d = r ? await r.json().catch(() => ({})) : {}
    setSyncing(false)
    if (!r || !r.ok) setSyncNote(t('admin.zelle.sync.failed'))
    else setSyncNote(d.added ? t('admin.zelle.sync.added', { n: d.added }) : t('admin.zelle.sync.nothing'))
    await load()
    tellSidebar()
  }

  async function setDismissed(rc: Receipt, undo: boolean) {
    setBusy(rc.id)
    const r = await fetch('/api/admin/zelle/dismiss', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rc.id, undo, note: undo ? undefined : note }),
    }).catch(() => null)
    setBusy(null)
    if (!r || !r.ok) { setSyncNote(t('admin.zelle.saveFailed')); return }
    setDismissing(null); setNote('')
    await load()
    tellSidebar()
  }

  if (loadError) return <div className="p-8 text-amber-400 text-sm">{loadError}</div>
  if (!data) return <div className="p-8 text-gray-400 text-sm">{t('common.loading')}</div>

  const isOpen = (r: Receipt) => r.verified && !r.dismissed_at && r.remaining_cents > 0
  const openCount = data.receipts.filter(isOpen).length
  const shown = show === 'open' ? data.receipts.filter(isOpen) : data.receipts
  const g = data.gmail

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.nav.zelle')}</h1>
          <p className="text-gray-400 text-sm mt-1 max-w-2xl">{t('admin.zelle.intro')}</p>
        </div>
        <Link href="/admin/pos" className="px-3 py-1.5 rounded-lg bg-[#c9a84c] text-[#111d38] text-sm font-semibold">{t('admin.zelle.toPos')}</Link>
      </div>

      {gmailResult && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${gmailResult === 'connected' ? 'border-emerald-700 bg-emerald-900/20 text-emerald-300' : 'border-amber-700 bg-amber-900/20 text-amber-300'}`}>
          {t(GMAIL_RESULT_KEYS[gmailResult] || 'admin.zelle.gmail.result.failed', { email: ZELLE_EMAIL })}
        </div>
      )}

      {/* The mailbox connection: what everything on this page depends on. */}
      <div className="rounded-xl border border-[#1e3a6e] bg-[#111d38] p-4 mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold flex items-center gap-2">
              <span className={`inline-block w-2 h-2 rounded-full ${g.connected && !g.last_error ? 'bg-emerald-400' : g.connected ? 'bg-amber-400' : 'bg-gray-500'}`} />
              {g.connected ? t('admin.zelle.gmail.connected', { email: g.email || '' }) : t('admin.zelle.gmail.notConnected')}
            </p>
            <p className="text-gray-400 text-xs mt-1">
              {g.connected
                ? (g.last_sync_at ? t('admin.zelle.gmail.lastCheck', { when: when(g.last_sync_at) }) : t('admin.zelle.gmail.neverChecked'))
                : t('admin.zelle.gmail.why', { email: ZELLE_EMAIL })}
            </p>
            {g.connected && g.last_error && <p className="text-amber-400 text-xs mt-1 break-words">{t('admin.zelle.gmail.error', { error: g.last_error })}</p>}
            {!data.googleConfigured && <p className="text-amber-400 text-xs mt-1">{t('admin.zelle.gmail.setupNeeded')}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {g.connected && (
              <button onClick={syncNow} disabled={syncing}
                className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-200 text-sm disabled:opacity-50">
                {syncing ? t('admin.zelle.sync.running') : t('admin.zelle.sync.now')}
              </button>
            )}
            {data.owner && data.googleConfigured && (
              // A plain link: the route redirects to Google, and Google back.
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a href="/api/admin/zelle/gmail/connect"
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${g.connected ? 'border border-[#1e3a6e] text-gray-300' : 'bg-[#c9a84c] text-[#111d38]'}`}>
                {g.connected ? t('admin.zelle.gmail.reconnect') : t('admin.zelle.gmail.connect')}
              </a>
            )}
          </div>
        </div>
        {syncNote && <p className="text-gray-300 text-xs mt-3">{syncNote}</p>}
      </div>

      <div className="flex gap-1.5 mb-4">
        {(['open', 'all'] as const).map(v => (
          <button key={v} onClick={() => setShow(v)}
            className={`px-3 py-1.5 rounded-lg border text-sm ${show === v ? 'border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400'}`}>
            {v === 'open' ? t('admin.zelle.tab.open', { n: openCount }) : t('admin.zelle.tab.all', { n: data.receipts.length })}
          </button>
        ))}
      </div>

      {shown.length === 0 && <p className="text-gray-500 text-sm">{show === 'open' ? t('admin.zelle.nothingOpen') : t('admin.zelle.empty')}</p>}

      <div className="space-y-3">
        {shown.map(r => {
          const used = r.amount_cents - r.remaining_cents
          const state = !r.verified ? 'unverified' : r.dismissed_at ? 'dismissed' : r.remaining_cents > 0 ? 'open' : 'done'
          const chip = {
            open: ['border-[#c9a84c]/50 text-[#c9a84c]', used > 0 ? t('admin.zelle.state.partly', { amount: money(r.remaining_cents) }) : t('admin.zelle.state.open')],
            done: ['border-emerald-700 text-emerald-400', t('admin.zelle.state.done')],
            dismissed: ['border-gray-600 text-gray-400', t('admin.zelle.state.dismissed')],
            unverified: ['border-red-700 text-red-400', t('admin.zelle.state.unverified')],
          }[state] as [string, string]
          return (
            <div key={r.id} className={`rounded-xl border p-4 ${state === 'open' ? 'border-[#c9a84c]/40 bg-[#111d38]' : 'border-[#1e3a6e] bg-[#0f1a33]'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold">{r.payer_name}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{when(r.received_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-white text-lg font-bold tabular-nums">{money(r.amount_cents)}</p>
                  <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full border ${chip[0]}`}>{chip[1]}</span>
                </div>
              </div>
              <p className="text-gray-300 text-sm mt-2 break-words">{r.memo ? `“${r.memo}”` : <span className="text-gray-500">{t('admin.zelle.noMemo')}</span>}</p>
              {state === 'unverified' && <p className="text-red-400 text-xs mt-2">{t('admin.zelle.unverifiedHint')}</p>}
              {r.dismissed_at && (
                <p className="text-gray-500 text-xs mt-2">{t('admin.zelle.dismissedOn', { when: when(r.dismissed_at) })}{r.dismiss_note ? ` · ${r.dismiss_note}` : ''}</p>
              )}
              {r.uses.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-[#1e3a6e] pt-2">
                  {r.uses.map(u => (
                    <li key={u.id} className="text-xs text-gray-400 flex flex-wrap gap-x-2">
                      <span className="text-gray-200 tabular-nums">{money(u.amount_cents)}</span>
                      <span>{t(KIND_KEYS[u.sale_kind] || 'admin.zelle.kind.points')}</span>
                      {u.parent_name && <span>· {u.parent_name}</span>}
                      {u.invoice_id && (
                        <a href={`/api/invoices/${u.invoice_id}/pdf`} target="_blank" rel="noreferrer" className="text-[#c9a84c] underline">{u.invoice_number || t('admin.zelle.invoice')}</a>
                      )}
                      <span className="text-gray-600">{when(u.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {r.verified && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {r.dismissed_at ? (
                    <button onClick={() => setDismissed(r, true)} disabled={busy === r.id}
                      className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 text-xs disabled:opacity-50">{t('admin.zelle.undoDismiss')}</button>
                  ) : r.remaining_cents > 0 && (dismissing === r.id ? (
                    <>
                      <input value={note} onChange={e => setNote(e.target.value)} placeholder={t('admin.zelle.dismissPlaceholder')}
                        className="flex-1 min-w-[180px] bg-[#0d1829] border border-[#1e3a6e] rounded-lg px-3 py-1.5 text-white text-sm" />
                      <button onClick={() => setDismissed(r, false)} disabled={busy === r.id}
                        className="px-3 py-1.5 rounded-lg bg-gray-600 text-white text-xs font-semibold disabled:opacity-50">{t('admin.zelle.dismissConfirm')}</button>
                      <button onClick={() => { setDismissing(null); setNote('') }} className="px-2 py-1.5 text-gray-400 text-xs">{t('common.cancel')}</button>
                    </>
                  ) : (
                    <button onClick={() => { setDismissing(r.id); setNote('') }}
                      className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-400 text-xs">{t('admin.zelle.dismiss')}</button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
