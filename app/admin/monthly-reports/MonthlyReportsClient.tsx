'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'
import { formatTime12h } from '@/lib/date'
import { MASTERY_LABEL, MASTERY_COLOR, masteryOf } from '@/lib/mastery'
import { LEVEL_NAMES } from '@/lib/levels'

type Report = {
  id: string; student_id: string; month: string; status: 'draft' | 'approved' | 'sent'
  data: any; summary: string; focus: string
  generated_at: string; approved_at: string | null; sent_at: string | null; emailed_at: string | null
  feedback: 'up' | 'down' | null; feedback_comment: string | null; feedback_at: string | null
  studentName: string; parentName: string
  noteTexts: { date: string; coachName: string | null; text: string }[]
}
type Payload = { month: string; months: string[]; today: string; reports: Report[]; eligible: number | null; sendsFrom: string }

const monthLabel = (m: string) => new Date(m + 'T12:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', timeZone: 'UTC' })
const dayLabel = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short', timeZone: 'UTC' })

/**
 * Every family's monthly report, written by the model in English and read here
 * before anything leaves. Nothing is sent until every report of the month is
 * approved and the month is over; the last approval sends them all.
 */
export default function MonthlyReportsClient() {
  const [month, setMonth] = useState<string | null>(null)
  const [data, setData] = useState<Payload | null>(null)
  const [edits, setEdits] = useState<Record<string, { summary: string; focus: string }>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (m: string | null) => {
    const r = await fetch('/api/admin/monthly-reports' + (m ? '?month=' + m : '')).catch(() => null)
    if (!r || !r.ok) { setAlertMsg('Could not load the reports. Refresh the page to try again.'); return }
    const j: Payload = await r.json()
    setData(j)
    setMonth(j.month)
    setEdits({})
  }, [])
  useEffect(() => { load(null) }, [load])

  async function post(body: object) {
    const r = await fetch('/api/admin/monthly-reports', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null)
    if (!r) { setAlertMsg('Could not reach the server. Check your connection and try again.'); return null }
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setAlertMsg(j.error || 'That did not work. Please try again.'); return null }
    return j
  }

  async function generate() {
    if (!month) return
    setBusy('generate')
    let total = 0
    for (let round = 0; round < 30; round++) {
      setProgress(`Writing reports… ${total} done`)
      const j = await post({ action: 'generate', month })
      if (!j) break
      total += j.written
      if (j.remaining === 0 || j.written + j.failed === 0) {
        if (j.failed) setAlertMsg(`${j.failed} report(s) could not be written. Press Generate again to retry them.`)
        break
      }
    }
    setProgress(null)
    setBusy(null)
    await load(month)
  }

  async function act(r: Report, action: 'save' | 'approve' | 'unapprove' | 'regenerate') {
    const e = edits[r.id] || { summary: r.summary, focus: r.focus }
    setBusy(r.id + action)
    const j = await post({ action, id: r.id, summary: e.summary, focus: e.focus })
    setBusy(null)
    if (j) {
      if (action === 'approve' && j.sent?.some((s: any) => s.sent > 0)) setNotice('That was the last one: the whole month has been sent to the families.')
      await load(month)
    }
  }

  if (!data) return <div className="p-8 text-gray-400 text-sm">Loading…</div>

  const reports = data.reports
  const drafts = reports.filter(r => r.status === 'draft').length
  const approved = reports.filter(r => r.status === 'approved').length
  const sent = reports.filter(r => r.status === 'sent').length
  const missing = data.eligible == null ? 0 : Math.max(0, data.eligible - reports.length)
  const monthOver = data.today >= data.sendsFrom

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <AlertModal title="Sent" message={notice} onClose={() => setNotice(null)} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Monthly Reports</h1>
          <p className="text-gray-400 text-sm mt-1">Written on the last night of the month. Nothing reaches a family until every report is approved.</p>
        </div>
        <select value={month || ''} onChange={e => { setMonth(e.target.value); load(e.target.value) }}
          className="bg-[#111d38] border border-[#1e3a6e] text-white text-sm rounded-lg px-3 py-2">
          {data.months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-[#1e3a6e] bg-[#111d38] p-4 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="text-sm text-gray-300"><b className="text-white">{reports.length}</b> written{data.eligible != null ? ` of ${data.eligible} swimmers with lessons` : ''}</span>
        <span className="text-sm text-amber-300"><b>{drafts}</b> waiting for approval</span>
        <span className="text-sm text-emerald-300"><b>{approved}</b> approved</span>
        <span className="text-sm text-sky-300"><b>{sent}</b> sent</span>
        {missing > 0 && (
          <button onClick={generate} disabled={!!busy}
            className="ml-auto px-4 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm disabled:opacity-50">
            {progress || `Generate now (${missing})`}
          </button>
        )}
        <p className="basis-full text-xs text-gray-400">
          {sent > 0 && drafts + approved === 0 ? `Sent to the families${reports[0]?.sent_at ? ' on ' + new Date(reports[0].sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}.`
            : drafts > 0 ? `${drafts} not yet approved. The month goes out once all of them are${monthOver ? '' : `, on or after ${dayLabel(data.sendsFrom)}`}.`
            : reports.length > 0 && !monthOver ? `All approved. They go out on ${dayLabel(data.sendsFrom)}.`
            : reports.length === 0 ? 'No reports for this month yet.' : ''}
        </p>
      </div>

      <div className="space-y-4">
        {reports.map(r => {
          const d = r.data || {}
          const e = edits[r.id] || { summary: r.summary, focus: r.focus }
          const locked = r.status !== 'draft'
          const chip = r.status === 'sent' ? 'bg-sky-500/15 text-sky-300' : r.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
          const stageNow = (d.stages || []).find((s: any) => s.stage === d.stage)
          return (
            <div key={r.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-white font-semibold">{r.studentName} <span className={`ml-2 text-[11px] px-2 py-0.5 rounded-full ${chip}`}>{r.status === 'draft' ? 'Draft' : r.status === 'approved' ? 'Approved' : 'Sent'}</span></p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {r.parentName} · {d.lessons?.length || 0} lesson{d.lessons?.length === 1 ? '' : 's'} ({d.attended || 0} attended)
                    {d.level ? ` · L${d.level} ${LEVEL_NAMES[String(d.level)] || ''} · Stage ${d.stage}${stageNow ? ` ${stageNow.percent}%` : ''}` : ' · No level yet'}
                    {d.coachName ? ` · Coach ${d.coachName}` : ''}
                  </p>
                </div>
                <button onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))} className="text-xs text-gray-400 hover:text-[#c9a84c]">
                  {open[r.id] ? 'Hide the data ▴' : 'Show the data ▾'}
                </button>
              </div>

              {d.pendingReviews > 0 && r.status === 'draft' && (
                <p className="text-amber-300 text-xs mb-3">⚠ {d.pendingReviews} lesson report(s) from this month were still waiting in Reviews when this was written. Approve them there, then press Rewrite.</p>
              )}
              {d.aiFailed && r.status === 'draft' && (
                <p className="text-red-300 text-xs mb-3">The text could not be written automatically. Write it below, or press Rewrite.</p>
              )}

              {open[r.id] && (
                <div className="mb-4 grid md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-gray-500 uppercase tracking-wider mb-1">Lessons</p>
                    {(d.lessons || []).map((l: any) => (
                      <p key={l.key} className="text-gray-300">{dayLabel(l.date)} {l.start ? formatTime12h(l.start) : ''} · {l.isTrial ? 'Swim Assessment' : l.courseName} · <span className={l.attended ? 'text-emerald-300' : 'text-red-300'}>{l.attended ? 'attended' : 'absent'}</span></p>
                    ))}
                    {d.stageSkills?.length > 0 && <p className="text-gray-500 uppercase tracking-wider mt-3 mb-1">Stage {d.stage} skills (start → end of month)</p>}
                    {(d.stageSkills || []).map((s: any) => (
                      <p key={s.id} className="text-gray-300">{s.name}: <span style={{ color: MASTERY_COLOR[masteryOf(s.start)] }}>{MASTERY_LABEL[masteryOf(s.start)]}</span> → <span style={{ color: MASTERY_COLOR[masteryOf(s.end)] }}>{MASTERY_LABEL[masteryOf(s.end)]}</span></p>
                    ))}
                  </div>
                  <div>
                    <p className="text-gray-500 uppercase tracking-wider mb-1">Coach notes the family sees</p>
                    {r.noteTexts.length === 0 && <p className="text-gray-500">None this month.</p>}
                    {r.noteTexts.map((n, i) => <p key={i} className="text-gray-300 mb-2">{dayLabel(n.date)}{n.coachName ? ` · ${n.coachName}` : ''}: {n.text}</p>)}
                  </div>
                </div>
              )}

              <label className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Summary</label>
              <textarea value={e.summary} disabled={locked} rows={4}
                onChange={ev => setEdits(p => ({ ...p, [r.id]: { ...e, summary: ev.target.value } }))}
                className="w-full rounded-lg bg-[#0a1428] border border-[#1e3a6e] text-gray-200 text-sm px-3 py-2 disabled:opacity-70 focus:outline-none focus:border-[#c9a84c]/60" />
              <label className="block text-gray-500 text-xs uppercase tracking-wider mt-3 mb-1">Next month&apos;s focus · one per line</label>
              <textarea value={e.focus} disabled={locked} rows={2}
                onChange={ev => setEdits(p => ({ ...p, [r.id]: { ...e, focus: ev.target.value } }))}
                className="w-full rounded-lg bg-[#0a1428] border border-[#1e3a6e] text-gray-200 text-sm px-3 py-2 disabled:opacity-70 focus:outline-none focus:border-[#c9a84c]/60" />
              <p className="text-gray-600 text-[11px] mt-1">Written in English; the family reads it in their language once approved.</p>

              <div className="flex flex-wrap gap-2 mt-3">
                {r.status === 'draft' && (<>
                  <button onClick={() => act(r, 'approve')} disabled={!!busy}
                    className="px-4 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold text-sm disabled:opacity-50">
                    {busy === r.id + 'approve' ? 'Approving…' : 'Approve'}
                  </button>
                  {edits[r.id] && (
                    <button onClick={() => act(r, 'save')} disabled={!!busy}
                      className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm disabled:opacity-50">
                      {busy === r.id + 'save' ? 'Saving…' : 'Save draft'}
                    </button>
                  )}
                  <button onClick={() => act(r, 'regenerate')} disabled={!!busy}
                    className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm disabled:opacity-50">
                    {busy === r.id + 'regenerate' ? 'Rewriting…' : 'Rewrite'}
                  </button>
                </>)}
                {r.status === 'approved' && (
                  <button onClick={() => act(r, 'unapprove')} disabled={!!busy}
                    className="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm disabled:opacity-50">
                    {busy === r.id + 'unapprove' ? '…' : 'Edit again'}
                  </button>
                )}
                {r.status === 'sent' && (
                  <p className="text-sm text-gray-400">
                    Family&apos;s answer: {r.feedback === 'up' ? '👍 Clear' : r.feedback === 'down' ? '🤔 Has a question' : 'none yet'}
                    {r.feedback_comment ? <span className="block text-gray-300 mt-1">“{r.feedback_comment}”</span> : null}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
