'use client'

import { useT } from '@/lib/i18n/provider'
import { COACH_EVENTS, eventLabel, parseTime } from '@/lib/swim-times'

/* 測驗秒數 (owner, 2026-11-17): optional seconds a coach adds to a lesson
   report -- an event and a time, as many rows as needed. They are sent with
   the report and wait with it; the family sees them on 成績 once an admin
   confirms the report. */

export type TimeRow = { event: number; text: string }

/** The rows ready to send ({ distance, stroke, cs }), or 'bad' when one has a
 *  time that cannot be read. Empty rows are left out. */
export function timesToSend(rows: TimeRow[] | undefined): { distance: number; stroke: string; cs: number }[] | 'bad' {
  const out: { distance: number; stroke: string; cs: number }[] = []
  for (const r of rows || []) {
    if (!r.text.trim()) continue
    const cs = parseTime(r.text)
    const ev = COACH_EVENTS[r.event]
    if (cs === null || !ev) return 'bad'
    out.push({ distance: ev.distance, stroke: ev.stroke, cs })
  }
  return out
}

export default function SwimTimesInput({ rows, onChange, disabled }: { rows: TimeRow[]; onChange: (rows: TimeRow[]) => void; disabled?: boolean }) {
  const t = useT()
  const list = rows.length ? rows : []
  const set = (i: number, r: Partial<TimeRow>) => onChange(list.map((x, j) => (j === i ? { ...x, ...r } : x)))
  return (
    <div className="mt-4 rounded-lg border border-[#1e3a6e] bg-[#0d1529] p-3">
      <p className="text-gray-300 text-xs font-semibold mb-1">{t('coach.times.title')}</p>
      <p className="text-[11px] text-gray-500 mb-2">{t('coach.times.hint')}</p>
      <div className="space-y-2">
        {list.map((r, i) => {
          const bad = r.text.trim() !== '' && parseTime(r.text) === null
          return (
            <div key={i}>
              <div className="flex gap-2 items-center">
                <select value={r.event} disabled={disabled} aria-label={t('coach.times.event')}
                  onChange={e => set(i, { event: Number(e.target.value) })}
                  className="flex-1 min-w-0 rounded-lg border border-[#1e3a6e] bg-[#111d38] text-white text-sm px-2 py-2.5">
                  {COACH_EVENTS.map((ev, j) => <option key={j} value={j}>{eventLabel(t, { ...ev, unit: 'yd' })}</option>)}
                </select>
                <input inputMode="decimal" value={r.text} disabled={disabled} placeholder="24.56" aria-label={t('coach.times.seconds')}
                  onChange={e => set(i, { text: e.target.value })}
                  className={`w-24 rounded-lg border bg-[#111d38] text-white text-base font-bold text-center px-2 py-2 ${bad ? 'border-red-400' : 'border-[#1e3a6e]'}`} />
                <span className="text-gray-400 text-xs">{t('coach.times.sec')}</span>
                <button type="button" disabled={disabled} onClick={() => onChange(list.filter((_, j) => j !== i))}
                  aria-label={t('coach.times.remove')} className="text-gray-500 hover:text-red-300 px-1 text-lg leading-none">×</button>
              </div>
              {bad && <p className="text-red-400 text-[11px] mt-1">{t('coach.times.bad')}</p>}
            </div>
          )
        })}
      </div>
      <button type="button" disabled={disabled || list.length >= 8}
        onClick={() => onChange([...list, { event: list.length ? list[list.length - 1].event : 0, text: '' }])}
        className="mt-2 text-[#c9a84c] text-xs font-bold disabled:opacity-40">{list.length ? t('coach.times.addMore') : t('coach.times.add')}</button>
    </div>
  )
}
