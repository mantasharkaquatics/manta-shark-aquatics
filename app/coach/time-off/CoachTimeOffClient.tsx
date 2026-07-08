'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type TimeOff = { id: string; date: string; reason: string | null; created_at: string; start_time: string | null; end_time: string | null }

export default function CoachTimeOffClient({
  coach,
  timeOffList: initial,
  today,
}: {
  coach: { id: string; first_name: string; last_name: string }
  timeOffList: TimeOff[]
  today: string
}) {
  const supabase = createClient()
  const [timeOffList, setTimeOffList] = useState<TimeOff[]>(initial)
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [allDay, setAllDay] = useState(true)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const formatDate = (d: string) => {
    const dt = new Date(d + 'T12:00:00')
    return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  const fmt12 = (t: string) => {
    const [h, m] = t.slice(0, 5).split(':').map(Number)
    const ap = h >= 12 ? 'PM' : 'AM'
    const hh = h % 12 === 0 ? 12 : h % 12
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`
  }

  const handleSubmit = async () => {
    if (!date) { setError('Please select a date.'); return }
    if (date < today) { setError('Cannot request time off for past dates.'); return }
    if (!allDay) {
      if (!startTime || !endTime) { setError('Please select start and end times.'); return }
      if (startTime >= endTime) { setError('End time must be after start time.'); return }
    }
    const toM = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m }
    const clash = timeOffList.some(t => {
      if (t.date !== date) return false
      if (allDay || t.start_time == null || t.end_time == null) return true
      return toM(startTime) < toM(t.end_time) && toM(endTime) > toM(t.start_time)
    })
    if (clash) { setError('This overlaps with your existing time off on this date.'); return }
    setSubmitting(true)
    setError('')
    setSuccess('')
    const { data, error: err } = await supabase
      .from('coach_time_off')
      .insert({ coach_id: coach.id, date, reason: reason || null, start_time: allDay ? null : startTime, end_time: allDay ? null : endTime })
      .select()
      .single()
    if (err) {
      setError('Failed to submit. Please try again.')
    } else {
      setTimeOffList(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
      setDate('')
      setReason('')
      setAllDay(true)
      setStartTime('')
      setEndTime('')
      setSuccess(`Time off requested for ${formatDate(date)}!`)
    }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('coach_time_off').delete().eq('id', id)
    setTimeOffList(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">Time Off Requests</h1>
        <p className="text-gray-400 mt-1">Request days off — admin will be notified</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6">
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-5">New Request</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">Date</label>
              <input
                type="date"
                value={date}
                min={today}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="allDay"
                checked={allDay}
                onChange={e => setAllDay(e.target.checked)}
                className="w-4 h-4 accent-[#c9a84c]"
              />
              <label htmlFor="allDay" className="text-gray-400 text-sm select-none">All day</label>
            </div>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">From</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">To</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-gray-400 text-sm mb-2">Reason <span className="text-gray-600">(optional)</span></label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Family event, Medical appointment..."
                rows={3}
                className="w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors resize-none placeholder-gray-600"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-green-400 text-sm">✓ {success}</p>}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] font-semibold py-3 rounded-lg transition-all"
            >
              {submitting ? 'Submitting...' : 'Request Time Off'}
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-5">Upcoming Time Off</h2>
          {timeOffList.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center">
              <p className="text-gray-400">No upcoming time off scheduled</p>
            </div>
          ) : (
            <div className="space-y-3">
              {timeOffList.map(item => (
                <div key={item.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{formatDate(item.date)}</p>
                    <p className="text-[#c9a84c] text-xs mt-0.5">{item.start_time && item.end_time ? `${fmt12(item.start_time)} – ${fmt12(item.end_time)}` : 'All day'}</p>
                    {item.reason && <p className="text-gray-400 text-sm mt-0.5">{item.reason}</p>}
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors text-sm ml-4 flex-shrink-0"
                  >
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
