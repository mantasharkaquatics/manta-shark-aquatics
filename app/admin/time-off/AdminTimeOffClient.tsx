'use client'

import { useState } from 'react'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag, tDb } from '@/lib/i18n'

type Coach = { id: string; first_name: string; last_name: string }
type Item = {
  id: string; date: string; reason: string | null; created_at: string
  start_time: string | null; end_time: string | null; block_type: string
  coaches: { first_name: string; last_name: string } | null
}
type ImpactItem = {
  booking_id: string; lesson_key?: string; delivered?: boolean; status: string; notice_sent_at: string | null
  student_name: string; parent_name: string; course_name: string; course_type_id?: string | null; date: string; time: string
}

export default function AdminTimeOffClient({ coaches, initialList, pastList, impactStats, today }: {
  coaches: Coach[]
  initialList: Item[]
  pastList: Item[]
  impactStats: Record<string, { pending: number; notified: number; handled: number }>
  today: string
}) {
  const t = useT()
  const locale = useLocale()
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
  // Notify / cancel used to swallow a failed response and just reload the list,
  // so the desk never saw why nothing happened (found 2026-10-04).
  const [actionError, setActionError] = useState<Record<string, string>>({})
  const [confirmAction, setConfirmAction] = useState<{ kind: 'cancel' | 'delete'; id: string; count?: number } | null>(null)

  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString(dateTag(locale, 'en-US'), { weekday: 'short', month: 'long', day: 'numeric' })
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
      setImpact(prev => ({ ...prev, [blockId]: { loading: false, items: [], error: data.error || t('admin.timeOff.err.loadFailed') } }))
    } else {
      setImpact(prev => ({ ...prev, [blockId]: { loading: false, items: data.items || [], error: '' } }))
    }
  }

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    loadImpact(id)
  }

  // One step (owner, 2026-10-07): cancel the affected lessons, return points
  // or vouchers, then email the families. "Notify" used to be its own button,
  // and the gap between the two left families told "cancelled" about lessons
  // that were still booked (found 2026-10-07).
  const handleCancelNotify = async (blockId: string) => {
    setActing(blockId)
    let msg = ''
    try {
      const res = await fetch('/api/admin/time-off/impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel_notify', block_id: blockId }),
      })
      const data = await res.json().catch(() => ({}))
      msg = !res.ok ? (data.error || t('admin.timeOff.err.actionFailed'))
        : [data.failed > 0 ? t('admin.timeOff.err.emailFailed', { n: data.failed }) : '',
           data.refundPending > 0 ? t('admin.timeOff.err.refundPending', { n: data.refundPending }) : ''].filter(Boolean).join(' ')
    } catch {
      msg = t('admin.timeOff.err.actionFailed')
    }
    setActionError(prev => ({ ...prev, [blockId]: msg }))
    await loadImpact(blockId)
    setActing(null)
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    if (!coachId) { setError(t('admin.timeOff.err.selectCoach')); return }
    if (!date) { setError(t('admin.timeOff.err.selectDate')); return }
    if (!allDay && (!startTime || !endTime)) { setError(t('admin.timeOff.err.selectTimes')); return }
    setSubmitting(true)
    const res = await fetch('/api/admin/time-off', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coach_id: coachId, date, all_day: allDay, start_time: startTime, end_time: endTime, reason }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || t('admin.timeOff.err.createFailed'))
    } else {
      const coach = coaches.find(c => c.id === coachId) || null
      setList(prev => [...prev, { ...data.block, coaches: coach ? { first_name: coach.first_name, last_name: coach.last_name } : null }]
        .sort((a, b) => a.date.localeCompare(b.date)))
      setDate('')
      setAllDay(true)
      setStartTime('')
      setEndTime('')
      setReason('')
      setSuccess(t('admin.timeOff.blockCreated'))
    }
    setSubmitting(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    const res = await fetch('/api/admin/time-off', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setList(prev => prev.filter(row => row.id !== id))
    setDeleting(null)
  }

  const inputCls = "w-full bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-[#c9a84c] transition-colors"

  const renderCard = (item: Item, removable: boolean) => {
    const imp = impact[item.id]
    // The items are booking rows: a 60-minute lesson is two of them. The
    // buttons counted rows, so one lesson read as 2 (found 2026-10-04). Count
    // distinct lessons, and leave out lessons already delivered (the API will
    // not notify or cancel those).
    const lessons = (xs: ImpactItem[]) => new Set(xs.map(i => i.lesson_key || i.booking_id)).size
    // What the one button acts on: lessons still booked (or an assessment
    // still waiting for payment), and cancelled lessons whose email failed.
    const toCancel = imp?.items.filter(i => (i.status === 'confirmed' || i.status === 'pending_payment' || i.status === 'pending_partner') && !i.delivered) || []
    const toEmail = imp?.items.filter(i => i.status === 'cancelled' && !i.notice_sent_at) || []
    const actionable = [...toCancel, ...toEmail]
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
              <p className="text-white font-medium flex items-center flex-wrap gap-2">
                <span>{t('admin.coachName', { name: `${item.coaches?.first_name ?? ''} ${item.coaches?.last_name ?? ''}` })}</span>
                {(() => {
                  const st = impactStats[item.id]
                  if (!st || (st.pending === 0 && st.notified === 0 && st.handled === 0)) return null
                  if (st.pending > 0) return <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded whitespace-nowrap font-normal">{t('admin.timeOff.affectedCount', { n: st.pending + st.notified })}</span>
                  if (st.notified > 0) return <span className="text-xs bg-amber-400/10 text-amber-300 px-2 py-0.5 rounded whitespace-nowrap font-normal">{t('admin.timeOff.notifiedAwaiting')}</span>
                  return <span className="text-xs bg-green-500/10 text-green-400 px-2 py-0.5 rounded whitespace-nowrap font-normal">{t('admin.timeOff.handledCount', { n: st.handled })}</span>
                })()}
              </p>
              <p className="text-[#c9a84c] text-sm">
                {formatDate(item.date)}
                <span className="text-gray-400"> · {item.start_time && item.end_time ? `${fmt12(item.start_time)} – ${fmt12(item.end_time)}` : t('coach.timeOff.allDay')}</span>
              </p>
              {(item.block_type === 'admin_block' || item.reason) && (
                <p className="text-xs mt-1 flex items-center flex-wrap gap-2">
                  {item.block_type === 'admin_block' && <span className="bg-red-500/15 text-red-400 px-2 py-0.5 rounded whitespace-nowrap">{t('admin.timeOff.adminBlock')}</span>}
                  {item.reason && <span className="text-gray-400">{item.reason}</span>}
                </p>
              )}
            </div>
          </button>
          <div className="flex items-center gap-4 ml-4 flex-shrink-0">
            <button onClick={() => toggleExpand(item.id)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-[#c9a84c] hover:border-[#c9a84c]/50 transition-colors">
              {isOpen ? t('admin.timeOff.hide') : t('admin.timeOff.affectedLessons')}
            </button>
            {removable && (
              <button onClick={() => setConfirmAction({ kind: 'delete', id: item.id })} disabled={deleting === item.id}
                className="text-gray-500 hover:text-red-400 transition-colors text-sm disabled:opacity-50">
                {deleting === item.id ? t('admin.timeOff.removing') : t('admin.timeOff.remove')}
              </button>
            )}
          </div>
        </div>
        {isOpen && (
          <div className="border-t border-[#1e3a6e] p-5 space-y-3">
            {imp?.loading ? (
              <p className="text-gray-400 text-sm">{t('admin.timeOff.loadingAffected')}</p>
            ) : imp?.error ? (
              <p className="text-red-400 text-sm">{imp.error}</p>
            ) : !imp || imp.items.length === 0 ? (
              <p className="text-gray-400 text-sm">{t('admin.timeOff.noneAffected')}</p>
            ) : (
              <>
                <div className="space-y-2">
                  {imp.items.map(i => (
                    <div key={i.booking_id} className="flex items-center justify-between bg-[#0d1529] rounded-lg px-4 py-2.5">
                      <div>
                        <p className="text-white text-sm font-medium">{i.student_name} <span className="text-gray-500 font-normal">({i.parent_name})</span></p>
                        <p className="text-gray-400 text-xs">{i.course_type_id ? tDb(locale, 'course_types', i.course_type_id, i.course_name) : i.course_name} · {i.time}</p>
                      </div>
                      {i.status === 'cancelled' && !i.notice_sent_at ? (
                        <span className="text-xs bg-amber-400/10 text-amber-300 px-2 py-1 rounded">{t('admin.timeOff.cancelledNoEmail')}</span>
                      ) : i.status === 'cancelled' ? (
                        <span className="text-xs bg-white/5 text-gray-400 px-2 py-1 rounded">{t('admin.timeOff.cancelledRefunded')}</span>
                      ) : i.delivered ? (
                        <span className="text-xs bg-white/5 text-gray-400 px-2 py-1 rounded">{t('admin.timeOff.delivered')}</span>
                      ) : i.status === 'pending_payment' ? (
                        <span className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded">{t('admin.timeOff.holdAwaitingPayment')}</span>
                      ) : i.notice_sent_at ? (
                        <span className="text-xs bg-amber-400/10 text-amber-300 px-2 py-1 rounded">{t('admin.timeOff.notifiedAwaiting')}</span>
                      ) : (
                        <span className="text-xs bg-red-500/10 text-red-400 px-2 py-1 rounded">{t('admin.timeOff.awaitingNotice')}</span>
                      )}
                    </div>
                  ))}
                </div>
                {actionable.length > 0 && (
                  <div className="flex gap-3 pt-1">
                    <button onClick={() => setConfirmAction({ kind: 'cancel', id: item.id, count: lessons(actionable) })}
                      disabled={acting === item.id}
                      className="flex-1 py-2.5 rounded-lg font-semibold text-sm disabled:opacity-40 transition-all"
                      style={{ backgroundColor: '#ef4444', color: '#fff' }}>
                      {acting === item.id ? t('admin.timeOff.working') : t('admin.timeOff.cancelRefundCount', { n: lessons(actionable) })}
                    </button>
                  </div>
                )}
                {actionError[item.id] && <p className="text-red-400 text-sm">{actionError[item.id]}</p>}
                {actionable.length === 0 && cancelledItems.length > 0 && (
                  <p className="text-gray-500 text-xs">{t('admin.timeOff.allHandled')}</p>
                )}
                <p className="text-gray-500 text-xs">{t('admin.timeOff.cancelHint')}</p>
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
        <h1 className="text-2xl font-bold text-white font-['Playfair_Display']">{t('admin.timeOff.title')}</h1>
        <p className="text-gray-400 mt-1">{t('admin.timeOff.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6">
        <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-6 h-fit">
          <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-5">{t('admin.timeOff.newBlock')}</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-2">{t('admin.timeOff.coach')}</label>
              <select value={coachId} onChange={e => setCoachId(e.target.value)} className={inputCls}>
                <option value="">{t('admin.timeOff.selectCoach')}</option>
                {coaches.map(c => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-gray-400 text-sm mb-2">{t('coach.timeOff.date')}</label>
              <input type="date" value={date} min={today} onChange={e => setDate(e.target.value)} className={inputCls} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="adminAllDay" checked={allDay} onChange={e => setAllDay(e.target.checked)} className="w-4 h-4 accent-[#c9a84c]" />
              <label htmlFor="adminAllDay" className="text-gray-400 text-sm select-none">{t('coach.timeOff.allDay')}</label>
            </div>
            {!allDay && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">{t('coach.timeOff.from')}</label>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">{t('coach.timeOff.to')}</label>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} />
                </div>
              </div>
            )}
            <div>
              <label className="block text-gray-400 text-sm mb-2">{t('coach.timeOff.reason')}<span className="text-gray-600">{t('admin.timeOff.optionalSpaced')}</span></label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
                placeholder={t('admin.timeOff.reasonPlaceholder')}
                className={inputCls + " resize-none placeholder-gray-600"} />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            {success && <p className="text-green-400 text-sm">✓ {success}</p>}
            <button onClick={handleSubmit} disabled={submitting}
              className="w-full bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] font-semibold py-3 rounded-lg transition-all">
              {submitting ? t('admin.timeOff.creating') : t('admin.timeOff.createBlock')}
            </button>
            <p className="text-gray-500 text-xs">{t('admin.timeOff.blockHint')}</p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-sm font-semibold text-[#c9a84c] uppercase tracking-wider mb-5">{t('admin.timeOff.upcoming')}</h2>
            {list.length === 0 ? (
              <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-12 text-center">
                <p className="text-gray-400">{t('admin.timeOff.noUpcoming')}</p>
              </div>
            ) : (
              <div className="space-y-3">{list.map(item => renderCard(item, true))}</div>
            )}
          </div>

          {confirmAction && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
              onClick={e => { if (e.target === e.currentTarget) setConfirmAction(null) }}>
              <div className="bg-[#1a2744] rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
                <h3 className="text-lg font-semibold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
                  {confirmAction.kind === 'cancel' ? t('admin.timeOff.confirmCancelTitle') : t('admin.timeOff.confirmRemoveTitle')}
                </h3>
                <p className="text-sm text-gray-400">
                  {confirmAction.kind === 'cancel'
                    ? ((confirmAction.count || 0) > 1 ? t('admin.timeOff.confirmCancelBodyPlural', { n: confirmAction.count ?? 0 }) : t('admin.timeOff.confirmCancelBody', { n: confirmAction.count ?? 0 }))
                    : t('admin.timeOff.confirmRemoveBody')}
                </p>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setConfirmAction(null)}
                    className="flex-1 py-2.5 rounded-lg border border-white/20 text-white/60 hover:text-white transition-colors text-sm">
                    {t('admin.timeOff.keep')}
                  </button>
                  <button onClick={() => {
                      const a = confirmAction
                      setConfirmAction(null)
                      if (a.kind === 'cancel') handleCancelNotify(a.id)
                      else handleDelete(a.id)
                    }}
                    className="flex-1 py-2.5 rounded-lg font-semibold text-sm"
                    style={{ backgroundColor: '#ef4444', color: '#fff' }}>
                    {confirmAction.kind === 'cancel' ? t('admin.timeOff.cancelRefund') : t('admin.timeOff.remove')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-5">{t('admin.timeOff.past')}</h2>
            {pastList.length === 0 ? (
              <div className="bg-[#111d38] rounded-xl border border-[#1e3a6e] p-8 text-center">
                <p className="text-gray-500">{t('admin.timeOff.noPast')}</p>
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
