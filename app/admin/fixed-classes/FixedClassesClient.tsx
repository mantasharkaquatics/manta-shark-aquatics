'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'

type FC = {
  id: string; status: 'active' | 'ended'; endedAt: string | null; endedReason: string | null
  family: string; swimmers: string[]; course: string; courseSlug: string; minutes: number
  coach: string; weekday: number; time: string; lessonsTotal: number; lessonsLeft: number; pointsLeft: number; nextDate: string | null
}
const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
const to12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}` }
const MODES = [
  { k: 'refund', label: 'Refund the points', hint: 'A good reason (moving away, illness). The points go back to the wallet and can be refunded as usual.' },
  { k: 'voucher', label: 'Make-up vouchers', hint: 'They keep swimming, just not at this time. One voucher per lesson, each usable for 4 weeks from that lesson’s date.' },
  { k: 'keep', label: 'No refund', hint: 'The lessons are cancelled and the points are kept.' },
] as const

/** Fixed classes: who has which weekly slot, how much is left, and ending
 *  one part-way -- the one change families cannot make online. */
export default function FixedClassesClient() {
  const [list, setList] = useState<FC[] | null>(null)
  const [show, setShow] = useState<'active' | 'ended'>('active')
  const [ending, setEnding] = useState<FC | null>(null)
  const [mode, setMode] = useState<'refund' | 'voucher' | 'keep' | ''>('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/fixed-classes').catch(() => null)
    if (!r || !r.ok) { setAlertMsg('Could not load the fixed classes. Refresh the page to try again.'); return }
    setList((await r.json()).classes || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function end() {
    if (!ending || !mode || !reason.trim()) return
    setBusy(true)
    const r = await fetch('/api/admin/fixed-classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'end', id: ending.id, mode, reason }) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    setBusy(false)
    if (!r || !r.ok) { setAlertMsg(j.error || 'That did not save. Please try again.'); return }
    setEnding(null)
    setDoneMsg(`Ended. ${j.lessons || 0} booking row(s) cancelled${mode === 'refund' ? `, ${j.refunded || 0} points refunded` : mode === 'voucher' ? `, ${j.vouchers || 0} voucher(s) issued` : ''}. The family has been emailed.`)
    await load()
  }

  if (!list) return <div className="p-8 text-gray-400 text-sm">Loading…</div>
  const shown = list.filter(c => c.status === show)
  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <AlertModal title="Done" message={doneMsg} onClose={() => setDoneMsg(null)} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Fixed Classes</h1>
        <p className="text-gray-400 text-sm mt-1">Same weekday, time and coach every week, ten lessons or more. Families take leave online (it becomes a make-up voucher); ending a class part-way is done here.</p>
      </div>
      <div className="flex gap-1.5 mb-4">
        {(['active', 'ended'] as const).map(k => (
          <button key={k} onClick={() => setShow(k)}
            className={`px-3 py-1.5 rounded-lg border text-sm ${show === k ? 'border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400'}`}>
            {k === 'active' ? `Running (${list.filter(c => c.status === 'active').length})` : `Ended (${list.filter(c => c.status === 'ended').length})`}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-gray-500 text-sm">Nothing here.</p>}
      <div className="space-y-2">
        {shown.map(c => (
          <div key={c.id} className="rounded-xl border border-[#1e3a6e] bg-[#111d38] p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold">{c.family} <span className="text-gray-400 font-normal">· {c.swimmers.join(' & ')}</span></p>
              <p className="text-gray-300 text-sm mt-1">{c.course}{c.minutes === 60 ? ' · 60 min' : ''} · {DAYS[c.weekday]} {to12(c.time)} · Coach {c.coach}</p>
              <p className="text-gray-500 text-xs mt-1">
                {c.status === 'active'
                  ? `${c.lessonsLeft} of ${c.lessonsTotal} lessons still to come${c.nextDate ? ` · next ${c.nextDate}` : ''} · ${c.pointsLeft} points in them`
                  : `Ended ${c.endedAt ? new Date(c.endedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''} · ${c.endedReason || ''}`}
              </p>
            </div>
            {c.status === 'active' && (
              <button onClick={() => { setEnding(c); setMode(''); setReason('') }} className="px-3 py-1.5 rounded-lg text-sm border border-red-500/50 text-red-300">End this class</button>
            )}
          </div>
        ))}
      </div>

      {ending && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEnding(null)}>
          <div className="bg-[#111d38] border border-[#1e3a6e] rounded-2xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-white font-bold text-lg">End this fixed class?</h2>
            <p className="text-gray-400 text-sm mt-1">{ending.family} · {ending.swimmers.join(' & ')} · {DAYS[ending.weekday]} {to12(ending.time)} · {ending.lessonsLeft} lessons left ({ending.pointsLeft} points)</p>
            <p className="text-gray-300 text-sm mt-4">The remaining lessons become:</p>
            <div className="mt-2 space-y-2">
              {MODES.map(m => (
                <button key={m.k} onClick={() => setMode(m.k)}
                  className={`w-full text-left rounded-lg border p-3 ${mode === m.k ? 'border-[#c9a84c] bg-[#c9a84c]/10' : 'border-[#1e3a6e]'}`}>
                  <span className={`text-sm font-semibold ${mode === m.k ? 'text-[#c9a84c]' : 'text-white'}`}>{m.label}</span>
                  <span className="block text-gray-400 text-xs mt-0.5">{m.hint}</span>
                </button>
              ))}
            </div>
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why (required)"
              className="mt-4 w-full rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white text-sm p-3" rows={2} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setEnding(null)} className="flex-1 px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm">Keep the class</button>
              <button disabled={busy || !mode || !reason.trim()} onClick={end}
                className="flex-1 px-3 py-2 rounded-lg bg-red-500/80 text-white text-sm font-semibold disabled:opacity-50">End class</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
