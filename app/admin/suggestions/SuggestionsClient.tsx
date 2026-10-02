'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

type Suggestion = {
  id: string; body: string; status: 'new' | 'done'; created_at: string; handled_at: string | null
  parentName: string; email: string | null; phone: string | null; swimmers: string[]
}

/** The suggestion box, newest first. "Done" once someone has dealt with it. */
export default function SuggestionsClient() {
  const t = useT()
  const locale = useLocale()
  const [list, setList] = useState<Suggestion[] | null>(null)
  const [show, setShow] = useState<'new' | 'all'>('new')
  const [busy, setBusy] = useState<string | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/suggestions').catch(() => null)
    if (!r || !r.ok) { setAlertMsg(t('admin.suggestions.err.loadFailed')); return }
    setList((await r.json()).suggestions || [])
  }, [t])
  useEffect(() => { load() }, [load])

  async function mark(s: Suggestion, status: 'new' | 'done') {
    setBusy(s.id)
    const r = await fetch('/api/admin/suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, status }),
    }).catch(() => null)
    setBusy(null)
    if (!r || !r.ok) { setAlertMsg(t('admin.suggestions.err.saveFailed')); return }
    setList(l => (l || []).map(x => x.id === s.id ? { ...x, status } : x))
  }

  if (!list) return <div className="p-8 text-gray-400 text-sm">{t('common.loading')}</div>
  const fresh = list.filter(s => s.status === 'new').length
  const shown = show === 'new' ? list.filter(s => s.status === 'new') : list

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.nav.suggestions')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('admin.suggestions.intro')}</p>
        </div>
        <div className="flex gap-1.5">
          {(['new', 'all'] as const).map(v => (
            <button key={v} onClick={() => setShow(v)}
              className={`px-3 py-1.5 rounded-lg border text-sm ${show === v ? 'border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400'}`}>
              {v === 'new' ? t('admin.suggestions.tabNew', { n: fresh }) : t('admin.suggestions.tabAll', { n: list.length })}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 && <p className="text-gray-500 text-sm">{show === 'new' ? t('admin.suggestions.nothingNew') : t('admin.suggestions.empty')}</p>}
      <div className="space-y-3">
        {shown.map(s => (
          <div key={s.id} className={`rounded-xl border p-4 ${s.status === 'new' ? 'border-[#c9a84c]/40 bg-[#111d38]' : 'border-[#1e3a6e] bg-[#0f1a33]'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold">{s.parentName || t('admin.suggestions.aFamily')}
                  {s.swimmers.length > 0 && <span className="text-gray-400 font-normal"> · {s.swimmers.join(', ')}</span>}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {t('admin.suggestions.dateTime', { date: new Date(s.created_at).toLocaleDateString(dateTag(locale, 'en-US'), { month: 'short', day: 'numeric' }), time: new Date(s.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) })}
                  {s.email ? ` · ${s.email}` : ''}{s.phone ? ` · ${s.phone}` : ''}
                </p>
              </div>
              <button onClick={() => mark(s, s.status === 'new' ? 'done' : 'new')} disabled={busy === s.id}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 ${s.status === 'new' ? 'bg-[#c9a84c] text-[#111d38]' : 'border border-gray-600 text-gray-300'}`}>
                {s.status === 'new' ? t('admin.suggestions.markDone') : t('admin.suggestions.moveBack')}
              </button>
            </div>
            <p className="text-gray-200 text-sm mt-3 whitespace-pre-wrap leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
