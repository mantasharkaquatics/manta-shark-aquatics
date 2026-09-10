'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale } from '@/lib/i18n/provider'

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
  const t = useT()
  const locale = useLocale()
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
    return dt.toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
  }

  const fmt12 = (t: string) => {
    const [h, m] = t.slice(0, 5).split(':').map(Number)
    const ap = h >= 12 ? 'PM' : 'AM'
    const hh = h % 12 === 0 ? 12 : h % 12
    return `${hh}:${String(m).padStart(2, '0')} ${ap}`
  }

  const handleSubmit = async () => {
    if (!date) { setError(t('coach.timeOff.errDate')); return }
    if (date < today) { setError(t('coach.timeOff.errPast')); return }
    if (!allDay) {
      if (!startTime || !endTime) { setError(t('coach.timeOff.errTimes')); return }
      if (startTime >= endTime) { setError(t('coach.timeOff.errOrder')); return }
    }
    const toM = (t: string) => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m }
    const clash = timeOffList.some(t => {
      if (t.date !== date) return false
      if (allDay || t.start_time == null || t.end_time == null) return true
      return toM(startTime) < toM(t.end_time) && toM(endTime) > toM(t.start_time)
    })
    if (clash) { setError(t('coach.timeOff.errClash')); return }
    setSubmitting(true)
    setError('')
    setSuccess('')
    const { data, error: err } = await supabase
      .from('coach_time_off')
      .insert({ coach_id: coach.id, date, reason: reason || null, start_time: allDay ? null : startTime, end_time: allDay ? null : endTime })
      .select()
      .single()
    if (err) {
      setError(t('coach.timeOff.errSend'))
    } else {
      setTimeOffList(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
      setDate('')
      setReason('')
      setAllDay(true)
      setStartTime('')
      setEndTime('')
      setSuccess(t('coach.timeOff.done', { date: formatDate(date) }))
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
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">{t('coach.timeOff.title')}</h1>
        <p className="text-gray-400 mt-1">{t('coach.timeOff.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6">
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-5">{t('coach.timeOff.newRequest')}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">{t('coach.timeOff.date')}</label>
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
              <label htmlFor="allDay" className="text-gray-400 text-sm select-none">{t('coach.timeOff.allDay')}</label>
            </div>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">{t('coach.timeOff.from')}</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">{t('coach.timeOff.to')}</label>
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
              <label className="block text-gray-400 text-sm mb-2">{t('coach.timeOff.reason')} <span className="text-gray-600">{t('coach.timeOff.optional')}</span></label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t('coach.timeOff.reasonHint')}
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
              {submitting ? t('coach.timeOff.submitting') : t('coach.timeOff.submit')}
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-5">{t('coach.timeOff.upcoming')}</h2>
          {timeOffList.length === 0 ? (
            <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center">
              <p className="text-gray-400">{t('coach.timeOff.noneUpcoming')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {timeOffList.map(item => (
                <div key={item.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-4 flex items-center justify-between">
                  <div>
                    <p className="text-white font-medium">{formatDate(item.date)}</p>
                    <p className="text-[#c9a84c] text-xs mt-0.5">{item.start_time && item.end_time ? `${fmt12(item.start_time)} – ${fmt12(item.end_time)}` : t('coach.timeOff.allDay')}</p>
                    {item.reason && <p className="text-gray-400 text-sm mt-0.5">{item.reason}</p>}
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-gray-500 hover:text-red-400 transition-colors text-sm ml-4 flex-shrink-0"
                  >
                    {t('coach.cancel')}
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
