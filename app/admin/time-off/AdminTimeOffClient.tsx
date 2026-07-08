'use client'

import { useState } from 'react'

type Coach = { id: string; first_name: string; last_name: string }
type Item = {
  id: string; date: string; reason: string | null; created_at: string
  start_time: string | null; end_time: string | null; block_type: string
  coaches: { first_name: string; last_name: string } | null
}
type ImpactItem = {
  booking_id: string; status: string; notice_sent_at: string | null
  student_name: string; parent_name: string; course_name: string; date: string; time: string
}

export default function AdminTimeOffClient({ coaches, initialList, pastList, today }: {
  coaches: Coach[]
  initialList: Item[]
  pastList: Item[]
  today: string
}) {
  const [list, setList] = useState<Item[]>(initialList)
  const [coachId, setCoachId] = useState('')
  const [date, setDate] = useState('')
  const [allDay, setAllDay] = useState(true)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [impact, setImpact] = useState<Record<string, { loading: boolean; items: ImpactItem[]; error: string }>>({})
  const [acting, setActing] = useState<string | null>(null)

  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' })
  const fmt12 = (t: string) => {
    const [h, m] = t.slice(0, 5).split(':').map(Number)
    const ap = h >= 12 ? 'PM' : 'AM'
    const hh = h % 12 === 0 ? 12 : h % 12
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`
  }

  const loadImpact = async (blockId: string) => {
    setImpact(prev => ({ ...prev, [blockId]: { loading: true, items: [], error: '' } }))
    const res = await fetch('/api/admin/time-off/impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list', block_id: blockId }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setImpact(prev => ({ ...prev, [blockId]: { loading: false, items: [], error: data.error || 'Failed to load' } }))
    } else {
      setImpact(prev => ({ ...prev, [blockId]: { loading: false, items: data.items || [], error: '' } }))
    }
  }

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    loadImpact(id)
  }

  const handleNotify = async (blockId: string) => {
    setActing(blockId)
    const res = await fetch('/api/admin/time-off/impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'notify', block_id: blockId }),
    })
    await res.json().catch(() => ({}))
    await loadImpact(blockId)
    setActing(null)
  }

  const handleCancelBookings = async (blockId: string) => {
    if (!confirm('Cancel all notified lessons and refund credits? This cannot be undone.')) return
    setActing(blockId)
    const res = await fetch('/api/admin/time-off/impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', block_id: blockId }),
    })
    await res.json().catch(() => ({}))
    await loadImpact(blockId)
    setActing(null)
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    if (!coachId) { setError('Please select a coach.'); return }
    if (!date) { setError('Please select a date.'); return }
    if (!allDay && (!startTime || !endTime)) { setError('Please select start and end times.'); return }
    setSubmitting(true)
    const res = await fetch('/api/admin/time-off', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_id: coachId, date, all_day: allDay, start_time: startTime, end_time: endTime, reason }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Failed to create block.')
    } else {
      const coach = coaches.find(c => c.id === coachId) || null
      setList(prev => [...prev, { ...data.block, coaches: coach ? { first_name: coach.first_name, last_name: coach.last_name } : null }]
        .sort((a, b) => a.date.localeCompare(b.date)))
      setDate('')
      setAllDay(true)
      setStartTime('')
      setEndTime('')
      setReason('')
      setSuccess('Block created.')
    }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this time off / block?')) return
    setDeleting(id)
    const res = await fetch('/api/admin/time-off', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setList(prev => prev.filter(t => t.id !== id))
    setDeleting(null)
  }

  const inputCls = "w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors"

  const renderCard = (item: Item, removable: boolean) => {
    const imp = impact[item.id]
    const confirmedNoNotice = imp?.items.filter(i => i.status === 'confirmed' && !i.notice_sent_at) || []
    const confirmedNotified = imp?.items.filter(i => i.status === 'confirmed' && i.notice_sent_at) || []
    const cancelledItems = imp?.items.filter(i => i.status === 'cancelled') || []
    const isOpen = expanded === item.id
    return (
      <div key={item.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e]">
        <div className="p-5 flex items-center justify-between">
          <button onClick={() => toggleExpand(item.id)} className="flex items-center gap-4 text-left flex-1">
            <div className="w-10 h-10 rounded-full bg-[#1e3a6e] flex items-center justify-center flex-shrink-0">
              <span className="text-[#c9a84c] font-bold text-sm">{item.coaches?.first_name?.charAt(0)}</span>
            </div>
            <div>
              <p className="text-white font-medium">Coach {item.coaches?.first_name} {item.coaches?.last_name}</p>
              <p className="text-[#c9a84c] text-sm">
                {formatDate(item.date)}
                <span className="text-gray-400"> · {item.start_time && item.end_time ? `${fmt12(item.start_time)} – ${fmt12(item.end_time)}` : 'All day'}</span>
                {item.block_type === 'admin_block' && <span className="ml-2 text-xs bg-red-500/15 text-red-400 px-2 py-0.5 rounded">Admin Block</span>}
              </p>
              {item.reason && <p className="text-gray-400 text-xs mt-0.5">{item.reason}</p>}
            </div>
          </button>
          <div className="flex items-center gap-4 ml-4 flex-shrink-0">
            <button onClick={() => toggleExpand(item.id)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-[#c9a84c] hover:border-[#c9a84c]/50 transition-colors">
              {isOpen ? '▲ Hide' : '▼ Affected lessons'}
            </button>
            {removable && (
              <button onClick={() => handleDelete(item.id)} disabled={deleting === item.id}
                className="text-gray-500 hover:text-red-400 transition-colors text-sm disabled:opacity-50">
                {deleting === item.id ? 'Removing...' : 'Remove'}
              </button>
            )}
          </div>
        </div>
        {isOpen && (
          <div className="border-t border-[#1e3a6e] p-5 space-y-3">
            {imp?.loading ? (
              <p className="text-gray-400 text-sm">Loading affected lessons...</p>
            ) : imp?.error ? (
              <p className="text-red-400 text-sm">{imp.error}</p>
            ) : !imp || imp.items.length === 0 ? (
              <p className="text-gray-400 text-sm">✓ No lessons affected by this block.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {imp.items.map(i => (
                    <div key={i.booking_id} className="flex items-center justify-between bg-[#0d1529] rounded-lg px-4 py-2.5">
                      <div>
                        <p className="text-white text-sm font-medium">{i.student_name} <span className="text-gray-500 font-normal">({i.parent_name})</span></p>
                        <p className="text-gray-400 text-xs">{i.course_name} · {i.time}</p>
                      </div>
                      {i.status === 'cancelled' ? (
                        <span className="text-xs bg-white/5 text-gray-400 px-2 py-1 rounded">✓ Cancelled · credit refunded</span>
                      ) : i.notice_sent_at ? (
                        <span className="text-xs bg-amber-400/10 text-amber-300 px-2 py-1 rounded">📧 Notified · awaiting cancel</span>
                      ) : (
                        <span className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded">⚠️ Awaiting notice</span>
                      )}
                    </div>
                  ))}
                </div>
                {(confirmedNoNotice.length > 0 || confirmedNotified.length > 0) && (
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => handleNotify(item.id)}
                      disabled={acting === item.id || confirmedNoNotice.length === 0}
                      className="flex-1 py-2.5 rounded-lg bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] font-semibold text-sm disabled:opacity-40 transition-all">
                      {acting === item.id ? 'Working...' : `📧 Send cancellation notices (${confirmedNoNotice.length})`}
                    </button>
                    <button onClick={() => handleCancelBookings(item.id)}
                      disabled={acting === item.id || confirmedNotified.length === 0}
                      className="flex-1 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40 transition-all"
                      style={{ backgroundColor: '#ef4444', color: '#fff' }}>
                      {acting === item.id ? 'Working...' : `Cancel & refund credits (${confirmedNotified.length})`}
                    </button>
                  </div>
                )}
                {confirmedNoNotice.length === 0 && confirmedNotified.length === 0 && cancelledItems.length > 0 && (
                  <p className="text-gray-500 text-xs">All affected lessons have been cancelled and credits refunded.</p>
                )}
                <p className="text-gray-500 text-xs">Cancel is only enabled for lessons whose notice has been sent — parents are always informed first.</p>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Coach Time Off &amp; Blocks</h1>
        <p className="text-gray-400 mt-1">Coach requests and admin schedule blocks</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 h-fit">
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-5">New Admin Block</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">Coach</label>
              <select value={coachId} onChange={e => setCoachId(e.target.value)} className={inputCls}>
                <option value="">Select a coach...</option>
                {coaches.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">Date</label>
              <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="adminAllDay" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="w-4 h-4 accent-[#c9a84c]" />
              <label htmlFor="adminAllDay" className="text-gray-400 text-sm select-none">All day</label>
            </div>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">From</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">To</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}
            <div>
              <label className="block text-gray-400 text-sm mb-2">Reason <span className="text-gray-600">(optional)</span></label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                placeholder="e.g. Facility maintenance, Private event..."
                className={inputCls + " resize-none placeholder-gray-600"} />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-green-400 text-sm">✓ {success}</p>}
            <button onClick={handleSubmit} disabled={submitting}
              className="w-full bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] font-semibold py-3 rounded-lg transition-all">
              {submitting ? 'Creating...' : 'Create Block'}
            </button>
            <p className="text-gray-500 text-xs">Blocks stop all self-serve booking (booking page, cart, AI assistant). Existing confirmed lessons are not changed.</p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-5">Upcoming</h2>
            {list.length === 0 ? (
              <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-12 text-center">
                <p className="text-gray-400">No upcoming time off or blocks</p>
              </div>
            ) : (
              <div className="space-y-3">{list.map(item => renderCard(item, true))}</div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">Past (last 20)</h2>
            {pastList.length === 0 ? (
              <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center">
                <p className="text-gray-500">No past records</p>
              </div>
            ) : (
              <div className="space-y-3 opacity-80">{pastList.map(item => renderCard(item, false))}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
