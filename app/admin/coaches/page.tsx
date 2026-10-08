'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'

type Coach = {
  id: string
  first_name: string
  last_name: string | null
  email: string
  is_active: boolean
  created_at: string
  zoned?: boolean
}

/** Error codes from /api/admin/coaches to our words: the route's are English
 *  and showed as is on a Chinese screen (found 2026-10-08). */
const COACH_ERROR_KEYS: Record<string, string> = {
  missing_fields: 'admin.coaches.err.missingFields',
  bad_pin: 'admin.coaches.err.badPin',
  pin_in_use: 'admin.coaches.err.pinInUse',
  email_taken: 'admin.coaches.err.emailTaken',
}

type DeactivateState =
  | { coach: Coach; phase: 'ask' | 'busy' | 'failed' }
  | { coach: Coach; phase: 'blocked'; lessons: number; fixedClasses: number; dates: string[]; moreDates: number }

const inputCls = "w-full bg-[#111d38] border border-[#1e3a6e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a84c]"

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TIME_OPTS: string[] = []
for (let h = 6; h <= 21; h++) {
  TIME_OPTS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 21) TIME_OPTS.push(`${String(h).padStart(2, '0')}:30`)
}

type DayRow = { enabled: boolean; start: string; end: string }

function SchedulePanel({ coachId }: { coachId: string }) {
  const t = useT()
  const [days, setDays] = useState<DayRow[]>(Array.from({ length: 7 }, () => ({ enabled: false, start: '09:00', end: '18:00' })))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/admin/coach-availability?coach_id=${coachId}`)
      .then(r => r.json())
      .then(data => {
        const next: DayRow[] = Array.from({ length: 7 }, () => ({ enabled: false, start: '09:00', end: '18:00' }))
        for (const row of (data.availability || [])) {
          next[row.day_of_week] = {
            enabled: !!row.is_active,
            start: String(row.start_time).slice(0, 5),
            end: String(row.end_time).slice(0, 5),
          }
        }
        setDays(next)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [coachId])

  const save = async () => {
    setSaving(true); setMsg(null)
    const payload = days
      .map((d, i) => ({ ...d, day_of_week: i }))
      .filter(d => d.enabled)
      .map(d => ({ day_of_week: d.day_of_week, start_time: d.start, end_time: d.end }))
    const res = await fetch('/api/admin/coach-availability', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_id: coachId, days: payload }),
    }).catch(() => null)
    setSaving(false)
    // Our words, not the route's English (found 2026-10-08).
    setMsg(res?.ok ? t('admin.coaches.saved') : t('admin.coaches.err.saveFailed'))
    if (res?.ok) setTimeout(() => setMsg(null), 2000)
  }

  const upd = (i: number, patch: Partial<DayRow>) => setDays(prev => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d))
  const selCls = "bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#c9a84c]"

  if (loading) return <p className="text-gray-500 text-sm py-2">{t('admin.coaches.loadingSchedule')}</p>
  return (
    <div className="space-y-2">
      <p className="text-gray-500 text-xs">{t('admin.coaches.scheduleHint')}</p>
      {DAY_NAMES.map((name, i) => (
        <div key={name} className="flex items-center gap-3">
          <label className="flex items-center gap-2 w-32 cursor-pointer">
            <input type="checkbox" checked={days[i].enabled} onChange={e => upd(i, { enabled: e.target.checked })}
              className="w-4 h-4 accent-[#c9a84c]" />
            <span className={`text-sm ${days[i].enabled ? 'text-white' : 'text-gray-500'}`}>{t(`date.weekday.${i}`)}</span>
          </label>
          {days[i].enabled ? (
            <div className="flex items-center gap-2">
              <select value={days[i].start} onChange={e => upd(i, { start: e.target.value })} className={selCls}>
                {TIME_OPTS.map(tm => <option key={tm} value={tm}>{tm}</option>)}
              </select>
              <span className="text-gray-500 text-sm">{t('admin.coaches.to')}</span>
              <select value={days[i].end} onChange={e => upd(i, { end: e.target.value })} className={selCls}>
                {TIME_OPTS.filter(tm => tm > days[i].start).map(tm => <option key={tm} value={tm}>{tm}</option>)}
              </select>
            </div>
          ) : (
            <span className="text-gray-600 text-sm">{t('admin.coaches.unavailable')}</span>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={save} disabled={saving}
          className="bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] text-xs font-semibold px-4 py-2 rounded-lg transition-all">
          {saving ? t('admin.coaches.saving') : t('admin.coaches.saveSchedule')}
        </button>
        {msg && <span className={`text-xs ${msg === t('admin.coaches.saved') ? 'text-green-400' : 'text-red-400'}`}>{msg}</span>}
      </div>
    </div>
  )
}

export default function AdminCoachesPage() {
  const t = useT()
  const locale = useLocale()
  // Deactivating asks first, and is refused while the coach still has
  // lessons to teach (owner, 2026-10-08).
  const [deactivate, setDeactivate] = useState<DeactivateState | null>(null)
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', pin: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editPinId, setEditPinId] = useState<string | null>(null)
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [editPin, setEditPin] = useState('')
  // Lifting a PIN lockout (owner, 2026-10-08: the front desk unlocks it; coaches
  // have no email way in). null = closed; 'ask' = confirming; then the answer.
  const [unlock, setUnlock] = useState<null | 'ask' | 'busy' | { cleared: number } | { failed: true }>(null)

  const load = async () => {
    const res = await fetch('/api/admin/coaches')
    const data = await res.json()
    setCoaches(data.coaches || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const addCoach = async () => {
    setSaving(true); setError(null)
    const res = await fetch('/api/admin/coaches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(t(COACH_ERROR_KEYS[String(data.code || '')] || 'admin.coaches.err.failed')); return }
    setForm({ first_name: '', last_name: '', email: '', pin: '' })
    setShowAdd(false)
    load()
  }

  const toggleActive = async (c: Coach) => {
    if (c.is_active) { setDeactivate({ coach: c, phase: 'ask' }); return }
    setError(null)
    const res = await fetch('/api/admin/coaches', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, is_active: true }),
    }).catch(() => null)
    if (!res?.ok) setError(t('admin.coaches.err.failed'))
    load()
  }

  const confirmDeactivate = async () => {
    if (!deactivate) return
    const coach = deactivate.coach
    setDeactivate({ coach, phase: 'busy' })
    const res = await fetch('/api/admin/coaches', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: coach.id, is_active: false }),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    if (res?.ok) { setDeactivate(null); load(); return }
    if (data.code === 'has_future_lessons') {
      setDeactivate({ coach, phase: 'blocked', lessons: Number(data.lessons) || 0, fixedClasses: Number(data.fixedClasses) || 0, dates: data.dates || [], moreDates: Number(data.moreDates) || 0 })
      return
    }
    setDeactivate({ coach, phase: 'failed' })
  }

  const shortDate = (ymd: string) => new Date(ymd + 'T12:00:00Z').toLocaleDateString(dateTag(locale, 'en-US'), { timeZone: 'UTC', month: 'short', day: 'numeric', weekday: 'short' })

  const savePin = async (id: string) => {
    setError(null)
    const res = await fetch('/api/admin/coaches', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pin: editPin }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(t(COACH_ERROR_KEYS[String(data.code || '')] || 'admin.coaches.err.failed')); return }
    setEditPinId(null); setEditPin('')
  }

  const unlockPin = async () => {
    setUnlock('busy')
    try {
      const res = await fetch('/api/admin/coach-pin-unlock', { method: 'POST' })
      const data = await res.json().catch(() => null)
      setUnlock(res.ok && data?.ok ? { cleared: Number(data.cleared) || 0 } : { failed: true })
    } catch {
      setUnlock({ failed: true })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">{t('admin.coaches.title')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('admin.coaches.summary', { active: coaches.filter(c => c.is_active).length, total: coaches.length })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={() => setUnlock('ask')}
            className="border border-[#1e3a6e] text-gray-300 hover:border-[#c9a84c]/50 hover:text-[#c9a84c] px-4 py-2 rounded-lg text-sm transition-all">
            {t('admin.coaches.unlockPin')}
          </button>
          <button onClick={() => { setShowAdd(!showAdd); setError(null) }}
            className="bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] font-semibold px-4 py-2 rounded-lg text-sm transition-all">
            {showAdd ? t('common.cancel') : t('admin.coaches.addCoach')}
          </button>
        </div>
      </div>

      {unlock && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { if (unlock !== 'busy') setUnlock(null) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="unlock-title" className="bg-[#111d38] border border-[#1e3a6e] rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 id="unlock-title" className="text-white font-bold text-lg">{t('admin.coaches.unlockTitle')}</h2>
            {unlock === 'ask' || unlock === 'busy' ? (
              <>
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">{t('admin.coaches.unlockBody')}</p>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setUnlock(null)} disabled={unlock === 'busy'}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm disabled:opacity-50">{t('common.cancel')}</button>
                  <button onClick={unlockPin} disabled={unlock === 'busy'}
                    className="flex-1 px-3 py-2 rounded-lg bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] text-sm font-semibold disabled:opacity-50">
                    {unlock === 'busy' ? t('admin.coaches.unlocking') : t('admin.coaches.unlockConfirm')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p role="status" className={`text-sm mt-2 leading-relaxed ${'failed' in unlock ? 'text-red-400' : 'text-green-400'}`}>
                  {'failed' in unlock ? t('admin.coaches.unlockFailed')
                    : unlock.cleared > 0 ? t('admin.coaches.unlockDone', { n: unlock.cleared })
                    : t('admin.coaches.unlockNone')}
                </p>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setUnlock(null)}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm">{t('common.close')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deactivate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { if (deactivate.phase !== 'busy') setDeactivate(null) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="deactivate-title" className="bg-[#111d38] border border-[#1e3a6e] rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 id="deactivate-title" className="text-white font-bold text-lg">
              {t('admin.coaches.deactivateTitle', { name: `${deactivate.coach.first_name} ${deactivate.coach.last_name || ''}`.trim() })}
            </h2>
            {deactivate.phase === 'blocked' ? (
              <>
                <p role="status" className="text-sm mt-2 leading-relaxed text-amber-300">
                  {t('admin.coaches.deactivateBlocked', { lessons: deactivate.lessons, fixed: deactivate.fixedClasses })}
                </p>
                {deactivate.dates.length > 0 && (
                  <p className="text-xs mt-2 text-gray-400">
                    {t('admin.coaches.deactivateDates', { dates: deactivate.dates.map(shortDate).join(', ') })}
                    {deactivate.moreDates > 0 ? ' ' + t('admin.coaches.deactivateMoreDates', { n: deactivate.moreDates }) : ''}
                  </p>
                )}
                <p className="text-xs mt-2 text-gray-400 leading-relaxed">{t('admin.coaches.deactivateHowTo')}</p>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setDeactivate(null)}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm">{t('common.close')}</button>
                  <Link href="/admin/booking" className="flex-1 px-3 py-2 rounded-lg bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] text-sm font-semibold text-center">{t('admin.coaches.openBooking')}</Link>
                </div>
              </>
            ) : (
              <>
                <p className="text-gray-400 text-sm mt-2 leading-relaxed">{t('admin.coaches.deactivateBody')}</p>
                {deactivate.phase === 'failed' && <p role="status" className="text-red-400 text-sm mt-2">{t('admin.coaches.deactivateFailed')}</p>}
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setDeactivate(null)} disabled={deactivate.phase === 'busy'}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm disabled:opacity-50">{t('common.cancel')}</button>
                  <button onClick={confirmDeactivate} disabled={deactivate.phase === 'busy'}
                    className="flex-1 px-3 py-2 rounded-lg border border-red-400/60 bg-red-500/20 text-red-200 text-sm font-semibold disabled:opacity-50">
                    {deactivate.phase === 'busy' ? t('admin.coaches.deactivateChecking') : t('admin.coaches.deactivate')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <input placeholder={t('admin.coaches.ph.firstName')} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className={inputCls} />
            <input placeholder={t('admin.coaches.ph.lastName')} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className={inputCls} />
            <input placeholder={t('admin.coaches.ph.email')} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
            <input placeholder={t('admin.coaches.ph.pin')} value={form.pin} maxLength={8} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} className={inputCls} />
          </div>
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <button onClick={addCoach} disabled={saving}
            className="bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] font-semibold px-5 py-2 rounded-lg text-sm transition-all">
            {saving ? t('admin.coaches.creating') : t('admin.coaches.createCoach')}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">{t('admin.coaches.loading')}</p>
      ) : coaches.length === 0 ? (
        <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl p-10 text-center">
          <p className="text-gray-400">{t('admin.coaches.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {coaches.map(c => (
            <div key={c.id} className={`bg-[#111d38] border rounded-xl ${c.is_active ? 'border-[#1e3a6e]' : 'border-[#1e3a6e]/40 opacity-60'}`}>
            <div className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1e3a6e] flex items-center justify-center">
                  <span className="text-[#c9a84c] font-bold">{c.first_name.charAt(0)}</span>
                </div>
                <div>
                  <p className="text-white font-medium">{c.first_name} {c.last_name || ''}
                    {!c.is_active && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{t('admin.coaches.inactive')}</span>}
                  </p>
                  <p className="text-gray-500 text-xs">{c.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setScheduleId(scheduleId === c.id ? null : c.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${scheduleId === c.id ? 'border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400 hover:border-[#c9a84c]/50 hover:text-[#c9a84c]'}`}>
                  {t('admin.coaches.schedule')}
                </button>
                {editPinId === c.id ? (
                  <>
                    <input placeholder={t('admin.coaches.ph.newPin')} value={editPin} maxLength={8}
                      onChange={e => setEditPin(e.target.value.replace(/\D/g, ''))}
                      className="bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-3 py-1.5 text-sm text-white w-44 focus:outline-none focus:border-[#c9a84c]" />
                    <button onClick={() => savePin(c.id)} className="text-xs px-3 py-1.5 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold">{t('common.save')}</button>
                    <button onClick={() => { setEditPinId(null); setEditPin(''); setError(null) }} className="text-xs px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-400">{t('common.cancel')}</button>
                  </>
                ) : (
                  <button onClick={() => { setEditPinId(c.id); setEditPin(''); setError(null) }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-400 hover:border-[#c9a84c]/50 hover:text-[#c9a84c] transition-all">
                    {t('admin.coaches.changePin')}
                  </button>
                )}
                <button onClick={() => toggleActive(c)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${c.is_active ? 'border-red-400/40 text-red-300 hover:bg-red-400/10' : 'border-green-400/40 text-green-300 hover:bg-green-400/10'}`}>
                  {c.is_active ? t('admin.coaches.deactivate') : t('admin.coaches.activate')}
                </button>
              </div>
            </div>
            {scheduleId === c.id && (
              <div className="border-t border-[#1e3a6e]/50 px-4 pb-4 pt-3">
                {c.zoned ? (
                  <div className="flex items-center gap-3 py-2">
                    <p className="text-sm text-gray-400">{t('admin.coaches.zonedBefore')}<span className="text-white font-medium">{t('admin.coaches.zonedZones')}</span>{t('admin.coaches.zonedAfter')}</p>
                    <a href="/admin/zones" className="text-xs px-3 py-1.5 rounded-lg border border-[#c9a84c]/50 text-[#c9a84c] hover:bg-[#c9a84c]/10 whitespace-nowrap transition-all">{t('admin.coaches.openZones')}</a>
                  </div>
                ) : (
                  <SchedulePanel coachId={c.id} />
                )}
              </div>
            )}
            </div>
          ))}
          {error && !showAdd && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      )}
    </div>
  )
}
