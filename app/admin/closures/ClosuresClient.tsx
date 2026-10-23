'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

/* Admin > Closures (owner, 2026-10-23): close a pool for a day, several days
   or part of one day. Fill the form, see what it touches, then one button
   blocks the hours, cancels the lessons (points back), emails and texts the
   families and puts up the banner. Below: recent closures, with the banner
   switch and "open booking again". lib/closures.ts does the work. */

type Pool = { id: string; name: string; is_active: boolean }
type Closure = {
  id: string; location_id: string; start_date: string; end_date: string; start_time: string | null; end_time: string | null
  reason_key: string; reason_text: string | null; banner_off_at: string | null; reopened_at: string | null
  created_at: string; created_by_name: string | null
  result: { cancelled: number; emailed: number; emailFailed: number; texted: number; teamEmailed: number; refundPending: number } | null
}
type Preview = {
  lessons: { date: string; start: string; end: string; coach: string; students: string[]; families: string[]; assessment: boolean }[]
  team: { date: string; start: string; end: string; team: string; coach: string; members: string[] }[]
  families: number
}

const REASONS = ['weather', 'power', 'water', 'venue', 'other'] as const
const ERR: Record<string, string> = {
  pool: 'admin.closures.err.pool', dates: 'admin.closures.err.dates', past: 'admin.closures.err.past',
  too_long: 'admin.closures.err.tooLong', times: 'admin.closures.err.times', times_one_day: 'admin.closures.err.timesOneDay',
  reason: 'admin.closures.err.reason', stripe: 'admin.closures.err.stripe',
}

const clock = (t: string | null) => {
  if (!t) return ''
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export default function ClosuresClient() {
  const t = useT()
  const locale = useLocale()
  const [pools, setPools] = useState<Pool[]>([])
  const [list, setList] = useState<Closure[] | null>(null)
  const [today, setToday] = useState('')
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ location_id: '', start_date: '', end_date: '', all_day: true, start_time: '', end_time: '', reason_key: '', reason_text: '' })
  const [preview, setPreview] = useState<Preview | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Closure['result'] | null>(null)
  const [reopening, setReopening] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/closures', { cache: 'no-store' }).catch(() => null)
    if (!r || !r.ok) { setAlertMsg(t('admin.closures.err.load')); setList([]); return }
    const j = await r.json()
    setPools(j.pools || []); setList(j.closures || []); setToday(j.today || '')
  }, [t])
  useEffect(() => { const id = setTimeout(load, 0); return () => clearTimeout(id) }, [load])

  const day = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString(dateTag(locale), { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' })
  const when = (c: { start_date: string; end_date: string; start_time: string | null; end_time: string | null }) =>
    c.start_date !== c.end_date ? `${day(c.start_date)} – ${day(c.end_date)}`
      : c.start_time ? `${day(c.start_date)} ${clock(c.start_time)} – ${clock(c.end_time)}`
      : `${day(c.start_date)} · ${t('admin.closures.allDay')}`
  const reasonOf = (c: { reason_key: string; reason_text: string | null }) => c.reason_key === 'other' ? (c.reason_text || '') : t(`admin.closures.reason.${c.reason_key}`)
  const poolName = (id: string) => pools.find(p => p.id === id)?.name || id

  const set = (patch: Partial<typeof form>) => { setForm(f => ({ ...f, ...patch })); setPreview(null); setConfirming(false) }
  const multiDay = !!form.end_date && form.end_date !== form.start_date
  const body = () => ({ ...form, end_date: form.end_date || form.start_date, all_day: form.all_day || multiDay })
  const ready = form.location_id && form.start_date && form.reason_key && (form.reason_key !== 'other' || form.reason_text.trim())
    && (form.all_day || multiDay || (form.start_time && form.end_time))

  const post = async (b: object) => {
    const r = await fetch('/api/admin/closures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) { setAlertMsg(t(ERR[(j as { code?: string }).code || ''] || 'admin.closures.err.failed')); return null }
    return j
  }

  async function runPreview() {
    setBusy(true); setDone(null)
    const j = await post({ action: 'preview', ...body() })
    setBusy(false)
    if (j) setPreview(j as Preview)
  }
  async function runCreate() {
    setBusy(true)
    const j = await post({ action: 'create', ...body() })
    setBusy(false)
    if (!j) return
    setDone((j as { result: Closure['result'] }).result)
    setOpen(false); setPreview(null); setConfirming(false)
    setForm({ location_id: form.location_id, start_date: '', end_date: '', all_day: true, start_time: '', end_time: '', reason_key: '', reason_text: '' })
    await load()
  }
  async function act(action: string, id: string) {
    setBusy(true)
    const j = await post({ action, id })
    setBusy(false)
    if (j) { setReopening(null); await load() }
  }

  if (!list) return <div className="p-8 text-gray-400 text-sm">{t('common.loading')}</div>
  const startForm = () => {
    setOpen(true); setDone(null)
    setForm(f => ({ ...f, location_id: f.location_id || pools.find(p => p.is_active)?.id || pools[0]?.id || '', start_date: f.start_date || today }))
  }
  const status = (c: Closure) => c.reopened_at ? 'reopened'
    : `${c.end_date} ${c.end_time?.slice(0, 5) || '24:00'}` < `${today} 00:00` ? 'over'
    : c.start_date > today ? 'upcoming' : 'active'
  const STATUS_STYLE: Record<string, string> = {
    active: 'border-red-500/50 text-red-300', upcoming: 'border-amber-500/50 text-amber-300',
    over: 'border-gray-600 text-gray-400', reopened: 'border-sky-500/40 text-sky-300',
  }
  const input = 'w-full rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white p-2.5 text-sm'

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.nav.closures')}</h1>
          <p className="text-gray-400 text-sm mt-1 max-w-2xl">{t('admin.closures.intro')}</p>
        </div>
        {!open && <button onClick={startForm} className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/80 text-white">{t('admin.closures.new')}</button>}
      </div>

      {done && (
        <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 mb-6 text-sm text-emerald-200">
          <p className="font-semibold">{t('admin.closures.done')}</p>
          <p className="mt-1">{t('admin.closures.resultLine', { cancelled: done.cancelled, emailed: done.emailed, texted: done.texted, team: done.teamEmailed })}</p>
          {done.emailFailed > 0 && <p className="mt-1 text-amber-300">{t('admin.closures.emailFailed', { n: done.emailFailed })}</p>}
          {done.refundPending > 0 && <p className="mt-1 text-amber-300">{t('admin.closures.refundPending', { n: done.refundPending })}</p>}
        </div>
      )}

      {open && (
        <div className="rounded-2xl border border-[#1e3a6e] bg-[#111d38] p-5 mb-8">
          <h2 className="text-white font-bold text-lg">{t('admin.closures.formTitle')}</h2>
          <div className="grid gap-4 mt-4 md:grid-cols-2">
            <label className="block text-gray-400 text-xs">{t('admin.closures.pool')}
              <select value={form.location_id} onChange={e => set({ location_id: e.target.value })} className={`mt-1 ${input}`}>
                {pools.map(p => <option key={p.id} value={p.id}>{p.name}{p.is_active ? '' : ` (${t('admin.closures.hiddenPool')})`}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-gray-400 text-xs">{t('admin.closures.from')}
                <input type="date" min={today} value={form.start_date} onChange={e => set({ start_date: e.target.value, end_date: form.end_date && form.end_date < e.target.value ? e.target.value : form.end_date })} className={`mt-1 ${input}`} />
              </label>
              <label className="block text-gray-400 text-xs">{t('admin.closures.to')}
                <input type="date" min={form.start_date || today} value={form.end_date || form.start_date} onChange={e => set({ end_date: e.target.value })} className={`mt-1 ${input}`} />
              </label>
            </div>
          </div>

          <div className="mt-4">
            <label className="inline-flex items-center gap-2 text-sm text-gray-200">
              <input type="checkbox" checked={form.all_day || multiDay} disabled={multiDay} onChange={e => set({ all_day: e.target.checked })} />
              {t('admin.closures.allDay')}
            </label>
            {multiDay && <span className="text-gray-500 text-xs ml-3">{t('admin.closures.multiDayAllDay')}</span>}
            {!form.all_day && !multiDay && (
              <div className="grid grid-cols-2 gap-3 mt-3 max-w-sm">
                <label className="block text-gray-400 text-xs">{t('admin.closures.startTime')}
                  <input type="time" step={300} value={form.start_time} onChange={e => set({ start_time: e.target.value })} className={`mt-1 ${input}`} />
                </label>
                <label className="block text-gray-400 text-xs">{t('admin.closures.endTime')}
                  <input type="time" step={300} value={form.end_time} onChange={e => set({ end_time: e.target.value })} className={`mt-1 ${input}`} />
                </label>
              </div>
            )}
          </div>

          <div className="mt-4">
            <p className="text-gray-400 text-xs mb-2">{t('admin.closures.reasonLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {REASONS.map(k => (
                <button key={k} type="button" onClick={() => set({ reason_key: k })}
                  className={`px-3 py-1.5 rounded-lg border text-sm ${form.reason_key === k ? 'border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-300'}`}>
                  {t(`admin.closures.reason.${k}`)}
                </button>
              ))}
            </div>
            {form.reason_key === 'other' && (
              <input value={form.reason_text} maxLength={120} onChange={e => set({ reason_text: e.target.value })}
                placeholder={t('admin.closures.reasonOtherPlaceholder')} className={`mt-3 ${input}`} />
            )}
            <p className="text-gray-500 text-xs mt-2">{t('admin.closures.reasonNote')}</p>
          </div>

          {!preview && (
            <div className="flex gap-2 mt-6">
              <button onClick={() => { setOpen(false); setPreview(null) }} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm">{t('common.cancel')}</button>
              <button disabled={!ready || busy} onClick={runPreview} className="px-4 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] text-sm font-semibold disabled:opacity-50">
                {busy ? t('common.loading') : t('admin.closures.previewButton')}
              </button>
            </div>
          )}

          {preview && (
            <div className="mt-6 border-t border-[#1e3a6e] pt-5">
              <p className="text-white font-semibold">
                {t('admin.closures.previewSummary', { lessons: preview.lessons.length, team: preview.team.length, families: preview.families })}
              </p>
              {preview.lessons.length > 0 && (
                <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
                  {preview.lessons.map((l, i) => (
                    <div key={i} className="text-sm text-gray-300 flex flex-wrap gap-x-3">
                      <span className="text-gray-400 tabular-nums">{day(l.date)} {clock(l.start)}–{clock(l.end)}</span>
                      <span>{l.students.join(' & ')}{l.assessment ? ` · ${t('admin.closures.assessment')}` : ''}</span>
                      <span className="text-gray-500">{t('admin.closures.coach', { name: l.coach })}</span>
                    </div>
                  ))}
                </div>
              )}
              {preview.team.length > 0 && (
                <div className="mt-4">
                  <p className="text-gray-400 text-xs mb-1">{t('admin.closures.teamTitle')}</p>
                  {preview.team.map((p, i) => (
                    <p key={i} className="text-sm text-gray-300">
                      <span className="text-gray-400 tabular-nums">{day(p.date)} {clock(p.start)}–{clock(p.end)}</span> · {p.team} · {t('admin.closures.members', { n: p.members.length })}
                    </p>
                  ))}
                </div>
              )}
              {preview.lessons.length === 0 && preview.team.length === 0 && <p className="text-gray-400 text-sm mt-2">{t('admin.closures.nothingBooked')}</p>}
              <p className="text-gray-500 text-xs mt-4">{t('admin.closures.whatHappens')}</p>

              {!confirming ? (
                <div className="flex gap-2 mt-4">
                  <button onClick={() => setPreview(null)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm">{t('admin.closures.back')}</button>
                  <button onClick={() => setConfirming(true)} className="px-4 py-2 rounded-lg bg-red-500/80 text-white text-sm font-semibold">{t('admin.closures.closeButton')}</button>
                </div>
              ) : (
                <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
                  <p className="text-red-200 text-sm">{t('admin.closures.confirm')}</p>
                  <div className="flex gap-2 mt-3">
                    <button disabled={busy} onClick={() => setConfirming(false)} className="px-4 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm">{t('common.cancel')}</button>
                    <button disabled={busy} onClick={runCreate} className="px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold disabled:opacity-50">
                      {busy ? t('admin.closures.working') : t('admin.closures.confirmButton')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <h2 className="text-white font-semibold mb-3">{t('admin.closures.listTitle')}</h2>
      {list.length === 0 && <p className="text-gray-500 text-sm">{t('admin.closures.none')}</p>}
      <div className="space-y-2">
        {list.map(c => {
          const st = status(c)
          const live = st === 'active' || st === 'upcoming'
          return (
            <div key={c.id} className="rounded-xl border border-[#1e3a6e] bg-[#111d38] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold">{poolName(c.location_id)} · {when(c)}</p>
                  <p className="text-gray-300 text-sm mt-1">{reasonOf(c)}</p>
                  {c.result && (
                    <p className="text-gray-500 text-xs mt-1">
                      {t('admin.closures.resultLine', { cancelled: c.result.cancelled, emailed: c.result.emailed, texted: c.result.texted, team: c.result.teamEmailed })}
                      {c.created_by_name ? ` · ${t('admin.closures.by', { name: c.created_by_name })}` : ''}
                    </p>
                  )}
                  {live && <p className="text-gray-500 text-xs mt-1">{c.banner_off_at ? t('admin.closures.bannerOff') : t('admin.closures.bannerOn')}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-md border text-xs ${STATUS_STYLE[st]}`}>{t(`admin.closures.status.${st}`)}</span>
                  {live && (
                    <button disabled={busy} onClick={() => act(c.banner_off_at ? 'banner_on' : 'banner_off', c.id)} className="px-3 py-1.5 rounded-lg text-sm border border-[#1e3a6e] text-gray-300">
                      {c.banner_off_at ? t('admin.closures.showBanner') : t('admin.closures.hideBanner')}
                    </button>
                  )}
                  {live && reopening !== c.id && (
                    <button disabled={busy} onClick={() => setReopening(c.id)} className="px-3 py-1.5 rounded-lg text-sm border border-sky-500/40 text-sky-300">{t('admin.closures.reopen')}</button>
                  )}
                </div>
              </div>
              {reopening === c.id && (
                <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3">
                  <p className="text-sky-100 text-sm">{t('admin.closures.reopenConfirm')}</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setReopening(null)} className="px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 text-sm">{t('common.cancel')}</button>
                    <button disabled={busy} onClick={() => act('reopen', c.id)} className="px-3 py-1.5 rounded-lg bg-sky-500/80 text-white text-sm font-semibold">{t('admin.closures.reopen')}</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
