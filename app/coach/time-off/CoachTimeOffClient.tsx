'use client'

import { useEffect, useState } from 'react'
import { useT, useLocale } from '@/lib/i18n/provider'
import { tDb } from '@/lib/i18n'

type ImpactLesson = { start: string; end: string; course_type_id: string | null; course_name: string; is_trial: boolean; swimmers: string[] }

type TimeOff = { id: string; date: string; reason: string | null; created_at: string; start_time: string | null; end_time: string | null }

// The route's refusals that the form already has words for.
const SUBMIT_ERROR_KEYS: Record<string, string> = {
  date: 'coach.timeOff.errDate',
  past: 'coach.timeOff.errPast',
  times: 'coach.timeOff.errTimes',
  order: 'coach.timeOff.errOrder',
  clash: 'coach.timeOff.errClash',
}

export default function CoachTimeOffClient({
  timeOffList: initial,
  lockedIds: initialLocked,
  today,
}: {
  coach: { id: string; first_name: string; last_name: string }
  timeOffList: TimeOff[]
  lockedIds: string[]
  today: string
}) {
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
  // Removing time off is a two-step: tap Cancel, then confirm in the row.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<{ id: string; msg: string } | null>(null)
  // Time off the admin has already cancelled lessons for and told families
  // about: the coach can no longer remove it (owner, 2026-10-07).
  const [lockedIds, setLockedIds] = useState<string[]>(initialLocked)
  // Lessons families already booked in the requested time (owner, 2026-10-04).
  // Kept per date/window key, so an answer for a day the coach has already
  // changed away from is never shown or trusted. null = the check failed.
  const [impacts, setImpacts] = useState<Record<string, ImpactLesson[] | null>>({})
  // Two-step submit when lessons are booked: the first press arms it for this
  // exact date/window, the second ("Submit anyway") sends. Changing the date or
  // time leaves the armed key behind, which disarms it.
  const [confirmKey, setConfirmKey] = useState('')

  const windowValid = !!date && (allDay || (!!startTime && !!endTime && startTime < endTime))
  const impactKey = windowValid ? `${date}|${allDay ? '' : `${startTime}-${endTime}`}` : ''

  // null = the check itself failed; the request still goes through (the
  // admin's Time Off page lists the same lessons), it just was not warned.
  const fetchImpact = async (key: string): Promise<ImpactLesson[] | null> => {
    const [d, win] = key.split('|')
    const qs = new URLSearchParams({ date: d })
    if (win) { const [s, e] = win.split('-'); qs.set('start', s); qs.set('end', e) }
    try {
      const res = await fetch(`/api/coach/time-off-impact?${qs}`)
      if (!res.ok) return null
      const json = await res.json()
      return Array.isArray(json?.lessons) ? json.lessons : null
    } catch { return null }
  }

  useEffect(() => {
    if (!impactKey) return
    let live = true
    fetchImpact(impactKey).then(lessons => {
      if (live) setImpacts(prev => ({ ...prev, [impactKey]: lessons }))
    })
    return () => { live = false }
  }, [impactKey])

  const impactLoading = !!impactKey && !(impactKey in impacts)
  const shownLessons = (impactKey && impacts[impactKey]) || []
  const confirmImpact = !!impactKey && confirmKey === impactKey
  const lessonLabel = (l: ImpactLesson) => l.is_trial
    ? t('common.assessment')
    : (l.course_type_id ? tDb(locale, 'course_types', l.course_type_id, l.course_name) : l.course_name)

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
    setError('')
    setSuccess('')
    if (!confirmImpact) {
      // An empty or missing answer is asked again at the press: the list may
      // still be loading, or a family may have booked since it loaded.
      const key = impactKey
      let lessons = impacts[key] ?? null
      if (!lessons || lessons.length === 0) {
        setSubmitting(true)
        lessons = await fetchImpact(key)
        setSubmitting(false)
        setImpacts(prev => ({ ...prev, [key]: lessons }))
      }
      if (lessons && lessons.length > 0) { setConfirmKey(key); return }
    }
    setSubmitting(true)
    // Through the server (found 2026-10-08): a browser insert ran nothing, so
    // the desk was never told about lessons this time off covers. The route
    // saves it and, when lessons are booked in it, alerts the desk.
    const res = await fetch('/api/coach/time-off', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, reason: reason || null, start_time: allDay ? null : startTime, end_time: allDay ? null : endTime }),
    }).catch(() => null)
    const json = res ? await res.json().catch(() => null) : null
    const data: TimeOff | null = res?.ok ? json?.item ?? null : null
    if (!data) {
      setError(t(SUBMIT_ERROR_KEYS[String(json?.code || '')] || 'coach.timeOff.errSend'))
    } else {
      setTimeOffList(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
      setDate('')
      setReason('')
      setAllDay(true)
      setStartTime('')
      setEndTime('')
      setConfirmKey('')
      setSuccess(Number(json?.affected) > 0
        ? t('coach.timeOff.doneNotified', { date: formatDate(date) })
        : t('coach.timeOff.done', { date: formatDate(date) }))
    }
    setSubmitting(false)
  }

  // One tap used to delete with no confirmation, and the row vanished even when
  // the delete failed, so the coach believed a day off was gone that the admin
  // still saw (found 2026-10-04). Now it asks first, and the row only leaves
  // the list once the server says it is gone. The delete goes through a route
  // that refuses once families have been told (found 2026-10-07).
  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setDeleteError(null)
    try {
      const res = await fetch('/api/coach/time-off', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setTimeOffList(prev => prev.filter(t => t.id !== id))
        setConfirmingId(null)
      } else if (data?.code === 'locked') {
        setLockedIds(prev => prev.includes(id) ? prev : [...prev, id])
        setConfirmingId(null)
      } else {
        setDeleteError({ id, msg: t('coach.timeOff.errDelete') })
      }
    } catch {
      setDeleteError({ id, msg: t('coach.timeOff.errDelete') })
    }
    setDeletingId(null)
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
            {impactLoading && shownLessons.length === 0 && (
              <p className="text-gray-500 text-sm">{t('coach.timeOff.impactChecking')}</p>
            )}
            {shownLessons.length > 0 && (
              <div className="bg-amber-900/20 border border-amber-500/40 rounded-lg p-4">
                <p className="text-amber-300 text-sm font-semibold">{t('coach.timeOff.impactTitle', { n: shownLessons.length })}</p>
                <p className="text-amber-100/80 text-sm mt-1">{t('coach.timeOff.impactBody')}</p>
                <ul className="mt-3 space-y-2">
                  {shownLessons.map((l, i) => (
                    <li key={`${i}-${l.start}`} className="text-sm">
                      <span className="text-white font-medium">{fmt12(l.start)} – {fmt12(l.end)}</span>
                      <span className="text-gray-300"> · {lessonLabel(l)}</span>
                      {l.swimmers.length > 0 && <span className="text-gray-400"> · {l.swimmers.join(', ')}</span>}
                    </li>
                  ))}
                </ul>
                {confirmImpact && (
                  <div className="mt-4 pt-3 border-t border-amber-500/30">
                    <p className="text-gray-200 text-sm mb-3">{t('coach.timeOff.impactConfirm')}</p>
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <button
                        onClick={() => setConfirmKey('')}
                        disabled={submitting}
                        className="text-gray-400 hover:text-white text-sm px-3 py-2 rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {t('coach.timeOff.goBack')}
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={submitting}
                        className="bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] text-sm font-semibold px-4 py-2 rounded-lg transition-all"
                      >
                        {submitting ? t('coach.timeOff.submitting') : t('coach.timeOff.submitAnyway')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-green-400 text-sm">✓ {success}</p>}
            {!confirmImpact && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] font-semibold py-3 rounded-lg transition-all"
              >
                {submitting ? t('coach.timeOff.submitting') : t('coach.timeOff.submit')}
              </button>
            )}
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
                <div key={item.id} className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">{formatDate(item.date)}</p>
                      <p className="text-[#c9a84c] text-xs mt-0.5">{item.start_time && item.end_time ? `${fmt12(item.start_time)} – ${fmt12(item.end_time)}` : t('coach.timeOff.allDay')}</p>
                      {item.reason && <p className="text-gray-400 text-sm mt-0.5">{item.reason}</p>}
                    </div>
                    {confirmingId !== item.id && !lockedIds.includes(item.id) && (
                      <button
                        onClick={() => { setConfirmingId(item.id); setDeleteError(null) }}
                        className="text-gray-500 hover:text-red-400 transition-colors text-sm ml-4 flex-shrink-0"
                      >
                        {t('coach.cancel')}
                      </button>
                    )}
                  </div>
                  {confirmingId === item.id && (
                    <div className="mt-3 pt-3 border-t border-[#1e3a6e] flex items-center justify-between gap-3 flex-wrap">
                      <p className="text-gray-300 text-sm">{t('coach.timeOff.confirmRemove')}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setConfirmingId(null); setDeleteError(null) }}
                          disabled={deletingId === item.id}
                          className="text-gray-400 hover:text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {t('coach.timeOff.keep')}
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={deletingId === item.id}
                          className="bg-red-900/40 hover:bg-red-900/60 text-red-300 text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                        >
                          {deletingId === item.id ? t('coach.timeOff.removing') : t('coach.timeOff.confirmYes')}
                        </button>
                      </div>
                    </div>
                  )}
                  {lockedIds.includes(item.id) && <p className="text-gray-400 text-xs mt-2">{t('coach.timeOff.lockedHint')}</p>}
                  {deleteError?.id === item.id && <p className="text-red-400 text-sm mt-2">{deleteError.msg}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
