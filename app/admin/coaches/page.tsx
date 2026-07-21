'use client'

import { useState, useEffect } from 'react'

type Coach = {
  id: string
  first_name: string
  last_name: string | null
  email: string
  is_active: boolean
  created_at: string
  zoned?: boolean
}

const inputCls = "w-full bg-[#111d38] border border-[#1e3a6e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a84c]"

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TIME_OPTS: string[] = []
for (let h = 6; h <= 21; h++) {
  TIME_OPTS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 21) TIME_OPTS.push(`${String(h).padStart(2, '0')}:30`)
}

type DayRow = { enabled: boolean; start: string; end: string }

function SchedulePanel({ coachId }: { coachId: string }) {
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
    })
    const data = await res.json()
    setSaving(false)
    setMsg(res.ok ? 'Saved' : (data.error || 'Save failed'))
    if (res.ok) setTimeout(() => setMsg(null), 2000)
  }

  const upd = (i: number, patch: Partial<DayRow>) => setDays(prev => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d))
  const selCls = "bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#c9a84c]"

  if (loading) return <p className="text-gray-500 text-sm py-2">Loading schedule...</p>
  return (
    <div className="space-y-2">
      <p className="text-gray-500 text-xs">Weekly working hours. Parents can only book within these windows. Unchecked days are unavailable.</p>
      {DAY_NAMES.map((name, i) => (
        <div key={name} className="flex items-center gap-3">
          <label className="flex items-center gap-2 w-32 cursor-pointer">
            <input type="checkbox" checked={days[i].enabled} onChange={e => upd(i, { enabled: e.target.checked })}
              className="w-4 h-4 accent-[#c9a84c]" />
            <span className={`text-sm ${days[i].enabled ? 'text-white' : 'text-gray-500'}`}>{name}</span>
          </label>
          {days[i].enabled ? (
            <div className="flex items-center gap-2">
              <select value={days[i].start} onChange={e => upd(i, { start: e.target.value })} className={selCls}>
                {TIME_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <span className="text-gray-500 text-sm">to</span>
              <select value={days[i].end} onChange={e => upd(i, { end: e.target.value })} className={selCls}>
                {TIME_OPTS.filter(t => t > days[i].start).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          ) : (
            <span className="text-gray-600 text-sm">Unavailable</span>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={save} disabled={saving}
          className="bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] text-xs font-semibold px-4 py-2 rounded-lg transition-all">
          {saving ? 'Saving...' : 'Save Schedule'}
        </button>
        {msg && <span className={`text-xs ${msg === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>{msg}</span>}
      </div>
    </div>
  )
}

export default function AdminCoachesPage() {
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', pin: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editPinId, setEditPinId] = useState<string | null>(null)
  const [scheduleId, setScheduleId] = useState<string | null>(null)
  const [editPin, setEditPin] = useState('')

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
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { setError(data.error || 'Failed'); return }
    setForm({ first_name: '', last_name: '', email: '', pin: '' })
    setShowAdd(false)
    load()
  }

  const toggleActive = async (c: Coach) => {
    await fetch('/api/admin/coaches', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, is_active: !c.is_active }),
    })
    load()
  }

  const savePin = async (id: string) => {
    setError(null)
    const res = await fetch('/api/admin/coaches', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, pin: editPin }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed'); return }
    setEditPinId(null); setEditPin('')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Coaches</h1>
          <p className="text-gray-400 text-sm mt-1">{coaches.filter(c => c.is_active).length} active · {coaches.length} total</p>
        </div>
        <button onClick={() => { setShowAdd(!showAdd); setError(null) }}
          className="bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] font-semibold px-4 py-2 rounded-lg text-sm transition-all">
          {showAdd ? 'Cancel' : '+ Add Coach'}
        </button>
      </div>

      {showAdd && (
        <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl p-5 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
            <input placeholder="First name *" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className={inputCls} />
            <input placeholder="Last name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className={inputCls} />
            <input placeholder="Email * (for login)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
            <input placeholder="PIN * (8 digits)" value={form.pin} maxLength={8} onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} className={inputCls} />
          </div>
          {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
          <button onClick={addCoach} disabled={saving}
            className="bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] font-semibold px-5 py-2 rounded-lg text-sm transition-all">
            {saving ? 'Creating...' : 'Create Coach'}
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : coaches.length === 0 ? (
        <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl p-10 text-center">
          <p className="text-gray-400">No coaches yet. Add your first coach to enable scheduling.</p>
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
                    {!c.is_active && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">Inactive</span>}
                  </p>
                  <p className="text-gray-500 text-xs">{c.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setScheduleId(scheduleId === c.id ? null : c.id)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${scheduleId === c.id ? 'border-[#c9a84c] bg-[#c9a84c]/20 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400 hover:border-[#c9a84c]/50 hover:text-[#c9a84c]'}`}>
                  Schedule
                </button>
                {editPinId === c.id ? (
                  <>
                    <input placeholder="New PIN (8 digits)" value={editPin} maxLength={8}
                      onChange={e => setEditPin(e.target.value.replace(/\D/g, ''))}
                      className="bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-3 py-1.5 text-sm text-white w-44 focus:outline-none focus:border-[#c9a84c]" />
                    <button onClick={() => savePin(c.id)} className="text-xs px-3 py-1.5 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold">Save</button>
                    <button onClick={() => { setEditPinId(null); setEditPin(''); setError(null) }} className="text-xs px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-400">Cancel</button>
                  </>
                ) : (
                  <button onClick={() => { setEditPinId(c.id); setEditPin(''); setError(null) }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-400 hover:border-[#c9a84c]/50 hover:text-[#c9a84c] transition-all">
                    Change PIN
                  </button>
                )}
                <button onClick={() => toggleActive(c)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${c.is_active ? 'border-red-400/40 text-red-300 hover:bg-red-400/10' : 'border-green-400/40 text-green-300 hover:bg-green-400/10'}`}>
                  {c.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
            {scheduleId === c.id && (
              <div className="border-t border-[#1e3a6e]/50 px-4 pb-4 pt-3">
                {c.zoned ? (
                  <div className="flex items-center gap-3 py-2">
                    <p className="text-sm text-gray-400">Availability for this coach is managed by <span className="text-white font-medium">Zones</span>. Legacy weekly hours below no longer apply.</p>
                    <a href="/admin/zones" className="text-xs px-3 py-1.5 rounded-lg border border-[#c9a84c]/50 text-[#c9a84c] hover:bg-[#c9a84c]/10 whitespace-nowrap transition-all">Open Zones →</a>
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
