'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'

type Suggestion = {
  id: string; body: string; status: 'new' | 'done'; created_at: string; handled_at: string | null
  parentName: string; email: string | null; phone: string | null; swimmers: string[]
}

/** The suggestion box, newest first. "Done" once someone has dealt with it. */
export default function SuggestionsClient() {
  const [list, setList] = useState<Suggestion[] | null>(null)
  const [show, setShow] = useState<'new' | 'all'>('new')
  const [busy, setBusy] = useState<string | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/suggestions').catch(() => null)
    if (!r || !r.ok) { setAlertMsg('Could not load the suggestions. Refresh the page to try again.'); return }
    setList((await r.json()).suggestions || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function mark(s: Suggestion, status: 'new' | 'done') {
    setBusy(s.id)
    const r = await fetch('/api/admin/suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id, status }),
    }).catch(() => null)
    setBusy(null)
    if (!r || !r.ok) { setAlertMsg('That did not save. Please try again.'); return }
    setList(l => (l || []).map(x => x.id === s.id ? { ...x, status } : x))
  }

  if (!list) return <div className="p-8 text-gray-400 text-sm">Loading…</div>
  const fresh = list.filter(s => s.status === 'new').length
  const shown = show === 'new' ? list.filter(s => s.status === 'new') : list

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Suggestions</h1>
          <p className="text-gray-400 text-sm mt-1">What families wrote in the dashboard&apos;s suggestion box. Only managers see this page.</p>
        </div>
        <div className="flex gap-1.5">
          {(['new', 'all'] as const).map(v => (
            <button key={v} onClick={() => setShow(v)}
              className={`px-3 py-1.5 rounded-lg border text-sm ${show === v ? 'border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400'}`}>
              {v === 'new' ? `New (${fresh})` : `All (${list.length})`}
            </button>
          ))}
        </div>
      </div>
      {shown.length === 0 && <p className="text-gray-500 text-sm">{show === 'new' ? 'Nothing new.' : 'No suggestions yet.'}</p>}
      <div className="space-y-3">
        {shown.map(s => (
          <div key={s.id} className={`rounded-xl border p-4 ${s.status === 'new' ? 'border-[#c9a84c]/40 bg-[#111d38]' : 'border-[#1e3a6e] bg-[#0f1a33]'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold">{s.parentName || 'A family'}
                  {s.swimmers.length > 0 && <span className="text-gray-400 font-normal"> · {s.swimmers.join(', ')}</span>}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {new Date(s.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  {s.email ? ` · ${s.email}` : ''}{s.phone ? ` · ${s.phone}` : ''}
                </p>
              </div>
              <button onClick={() => mark(s, s.status === 'new' ? 'done' : 'new')} disabled={busy === s.id}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-50 ${s.status === 'new' ? 'bg-[#c9a84c] text-[#111d38]' : 'border border-gray-600 text-gray-300'}`}>
                {s.status === 'new' ? 'Mark done' : 'Move back to new'}
              </button>
            </div>
            <p className="text-gray-200 text-sm mt-3 whitespace-pre-wrap leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
