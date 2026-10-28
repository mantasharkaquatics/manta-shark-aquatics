'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

/* Admin > 公告 (owner, 2026-10-28; lib/announcements.ts). What the desk
   writes here shows in the phone app's 訊息 > 學校公告 tab, as typed (one
   language). "Also push" sends it to the phones of people who turned on
   學校公告與活動 -- off until a family turns it on (Apple 4.5.4). Taking one
   down removes it from the app; a push already sent stays sent. */

type Row = { id: string; title: string; body: string; pinned: boolean; expires_at: string | null; pushed_at: string | null; push_count: number | null; created_at: string }

const field = 'w-full rounded-lg border border-[#1e3a6e] bg-[#0d1529] px-3 py-2 text-white text-sm focus:outline-none focus:border-[#c9a84c]'

export default function AnnouncementsClient() {
  const t = useT()
  const locale = useLocale()
  const [list, setList] = useState<Row[] | null>(null)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [until, setUntil] = useState('')
  const [push, setPush] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirmPost, setConfirmPost] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/announcements', { cache: 'no-store' }).catch(() => null)
    if (!r || !r.ok) { setAlertMsg(t('admin.ann.err.load')); return }
    setList((await r.json()).announcements || [])
  }, [t])
  useEffect(() => { const id = setTimeout(load, 0); return () => clearTimeout(id) }, [load])

  async function post() {
    setBusy(true); setDone(null)
    const r = await fetch('/api/admin/announcements', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, pinned, push, expires_at: until ? new Date(until + 'T23:59:00').toISOString() : null }),
    }).catch(() => null)
    setBusy(false); setConfirmPost(false)
    const d = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) { setAlertMsg(t(d.code === 'bad_expiry' ? 'admin.ann.err.expiry' : 'admin.ann.err.save')); return }
    setTitle(''); setBody(''); setPinned(false); setUntil(''); setPush(false)
    setDone(d.pushed == null ? t('admin.ann.posted') : t('admin.ann.postedPushed', { n: d.pushed }))
    load()
  }

  async function remove(id: string) {
    setConfirmDel(null)
    const r = await fetch(`/api/admin/announcements?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
    if (!r || !r.ok) { setAlertMsg(t('admin.ann.err.save')); return }
    setList(l => (l || []).filter(x => x.id !== id))
  }

  const when = (iso: string) => new Date(iso).toLocaleString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const expired = (r: Row) => !!r.expires_at && Date.parse(r.expires_at) < now

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <h1 className="text-2xl font-bold text-white">{t('admin.nav.announcements')}</h1>
      <p className="text-gray-400 text-sm mt-1 mb-6">{t('admin.ann.intro')}</p>

      <section className="rounded-xl border border-[#1e3a6e] bg-[#111d38] p-4 space-y-3 mb-8">
        <label className="block">
          <span className="block text-gray-300 text-xs mb-1">{t('admin.ann.title')}</span>
          <input className={field} value={title} maxLength={120} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-gray-300 text-xs mb-1">{t('admin.ann.body')}</span>
          <textarea className={field} rows={5} value={body} maxLength={4000} onChange={e => setBody(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-x-6 gap-y-3 items-end">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> {t('admin.ann.pinned')}
          </label>
          <label className="block">
            <span className="block text-gray-300 text-xs mb-1">{t('admin.ann.until')}</span>
            <input type="date" className={field} value={until} onChange={e => setUntil(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input type="checkbox" checked={push} onChange={e => setPush(e.target.checked)} /> {t('admin.ann.push')}
          </label>
        </div>
        {push && <p className="text-xs text-[#c9a84c]">{t('admin.ann.pushNote')}</p>}
        {done && <p className="text-sm text-emerald-400" role="status">{done}</p>}
        {confirmPost ? (
          <div className="flex gap-2">
            <button type="button" onClick={post} disabled={busy} className="px-4 py-2 rounded-lg bg-[#c9a84c] text-[#0d1529] text-sm font-semibold disabled:opacity-50">
              {busy ? t('admin.ann.posting') : push ? t('admin.ann.confirmPush') : t('admin.ann.confirm')}
            </button>
            <button type="button" onClick={() => setConfirmPost(false)} disabled={busy} className="px-4 py-2 rounded-lg border border-[#1e3a6e] text-gray-400 text-sm">{t('common.cancel')}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmPost(true)} disabled={!title.trim()} className="px-4 py-2 rounded-lg bg-[#c9a84c] text-[#0d1529] text-sm font-semibold disabled:opacity-40">
            {t('admin.ann.post')}
          </button>
        )}
      </section>

      {!list ? <p className="text-gray-400 text-sm">{t('common.loading')}</p>
        : list.length === 0 ? <p className="text-gray-500 text-sm">{t('admin.ann.empty')}</p>
        : (
          <div className="space-y-3">
            {list.map(a => (
              <div key={a.id} className={`rounded-xl border p-4 ${expired(a) ? 'border-[#1e3a6e] bg-[#0f1a33] opacity-60' : 'border-[#c9a84c]/40 bg-[#111d38]'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-semibold">{a.pinned && <span className="text-[#c9a84c] text-xs mr-2">{t('admin.ann.pinnedTag')}</span>}{a.title}</p>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {when(a.created_at)}
                      {a.expires_at ? ` · ${t(expired(a) ? 'admin.ann.ended' : 'admin.ann.endsOn', { date: when(a.expires_at) })}` : ''}
                      {a.pushed_at ? ` · ${t('admin.ann.pushedTo', { n: a.push_count ?? 0 })}` : ''}
                    </p>
                  </div>
                  {confirmDel === a.id ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => remove(a.id)} className="px-3 py-1.5 rounded-lg bg-red-500/80 text-white text-sm">{t('admin.ann.removeYes')}</button>
                      <button type="button" onClick={() => setConfirmDel(null)} className="px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-400 text-sm">{t('common.cancel')}</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDel(a.id)} className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 text-sm">{t('admin.ann.remove')}</button>
                  )}
                </div>
                {a.body && <p className="text-gray-300 text-sm mt-3 whitespace-pre-wrap">{a.body}</p>}
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
