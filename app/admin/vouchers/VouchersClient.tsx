'use client'

import { useCallback, useEffect, useState } from 'react'
import AlertModal from '@/components/AlertModal'
import { useT } from '@/lib/i18n/provider'
import type { TFunction } from '@/lib/i18n'
import { VOUCHER_ERROR_KEYS } from '@/lib/admin/voucher-errors'

type V = {
  id: string; parent_id: string; course_slug: string; minutes: number; reason: string; status: string
  expires_on: string; usable_from?: string | null; extended_at?: string | null; note: string | null; void_reason: string | null; created_at: string
  family: string; swimmers: string[]; fromLesson: string | null; usedFor: string | null
}
type Family = { id: string; name: string; students: { id: string; name: string }[] }

const KIND: Record<string, string> = { '1on1': 'admin.vouchers.kind.1on1', '1on2': 'admin.vouchers.kind.1on2', '1on4': 'admin.vouchers.kind.1on4' }
const REASON: Record<string, string> = { leave: 'admin.vouchers.reason.leave', grace: 'admin.vouchers.reason.grace', admin: 'admin.vouchers.reason.admin', end_of_term: 'admin.vouchers.reason.endOfTerm', moved: 'admin.vouchers.reason.moved' }
const STATUSES = ['active', 'used', 'expired', 'void']
const STATUS_STYLE: Record<string, string> = {
  active: 'border-emerald-500/40 text-emerald-300', used: 'border-sky-500/40 text-sky-300',
  expired: 'border-gray-600 text-gray-400', void: 'border-red-500/40 text-red-300',
}
const kindOf = (t: TFunction, v: { course_slug: string; minutes: number }) => `${KIND[v.course_slug] ? t(KIND[v.course_slug]) : v.course_slug}${v.course_slug === '1on1' ? ` · ${t('admin.vouchers.minutes', { n: v.minutes })}` : ''}`

/** Make-up vouchers: who holds what, what is about to run out, and the desk's
 *  two levers -- issue one by hand, void one with a reason. */
export default function VouchersClient() {
  const t = useT()
  const [list, setList] = useState<V[] | null>(null)
  const [families, setFamilies] = useState<Family[]>([])
  const [today, setToday] = useState('')
  const [show, setShow] = useState<'active' | 'expiring' | 'all'>('active')
  const [alertMsg, setAlertMsg] = useState<string | null>(null)
  const [voiding, setVoiding] = useState<V | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [form, setForm] = useState({ parent_id: '', student_id: '', student2_id: '', course_slug: '1on1', minutes: 30, expires_on: '', note: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/vouchers').catch(() => null)
    if (!r || !r.ok) { setAlertMsg(t('admin.vouchers.err.loadFailed')); return }
    const j = await r.json()
    setList(j.vouchers || []); setFamilies(j.families || []); setToday(j.today || '')
  }, [t])
  useEffect(() => { load() }, [load])

  const post = async (b: any) => {
    setBusy(true)
    const r = await fetch('/api/admin/vouchers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).catch(() => null)
    setBusy(false)
    const j = r ? await r.json().catch(() => ({})) : {}
    if (!r || !r.ok) { setAlertMsg(t(VOUCHER_ERROR_KEYS[String((j as any).code || '')] || 'admin.vouchers.err.saveFailed')); return false }
    await load()
    return true
  }

  if (!list) return <div className="p-8 text-gray-400 text-sm">{t('common.loading')}</div>
  const weekOut = today ? new Date(new Date(today + 'T12:00:00Z').getTime() + 7 * 86400000).toISOString().slice(0, 10) : ''
  const active = list.filter(v => v.status === 'active')
  const expiring = active.filter(v => v.expires_on <= weekOut)
  const shown = show === 'active' ? active : show === 'expiring' ? expiring : list
  const fam = families.find(f => f.id === form.parent_id)

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('admin.nav.vouchers')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('admin.vouchers.intro')}</p>
        </div>
        <button onClick={() => setIssuing(true)} className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-[#c9a84c] text-[#111d38]">{t('admin.vouchers.issueButton')}</button>
      </div>
      <div className="flex gap-1.5 mb-4">
        {([['active', t('admin.vouchers.tabActive', { n: active.length })], ['expiring', t('admin.vouchers.tabExpiring', { n: expiring.length })], ['all', t('admin.vouchers.tabAll', { n: list.length })]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setShow(k)}
            className={`px-3 py-1.5 rounded-lg border text-sm ${show === k ? 'border-[#c9a84c] bg-[#c9a84c]/15 text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400'}`}>{label}</button>
        ))}
      </div>
      {shown.length === 0 && <p className="text-gray-500 text-sm">{t('admin.vouchers.nothingHere')}</p>}
      <div className="space-y-2">
        {shown.map(v => (
          <div key={v.id} className="rounded-xl border border-[#1e3a6e] bg-[#111d38] p-4 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold">{v.family || t('admin.vouchers.aFamily')} <span className="text-gray-400 font-normal">· {v.swimmers.join(' & ')}</span></p>
              <p className="text-gray-300 text-sm mt-1">{kindOf(t, v)} · {v.usable_from ? `${t('admin.vouchers.makeUpBetween', { from: v.usable_from })} ` : `${t('admin.vouchers.useBy')} `}<span className={v.status === 'active' && v.expires_on <= weekOut ? 'text-amber-300 font-semibold' : ''}>{v.expires_on}</span>{v.extended_at ? <span className="text-gray-500"> {t('admin.vouchers.extendedOnce')}</span> : null}</p>
              <p className="text-gray-500 text-xs mt-1">
                {REASON[v.reason] ? t(REASON[v.reason]) : v.reason}{v.fromLesson ? ` · ${t('admin.vouchers.fromLesson', { when: v.fromLesson })}` : ''}{v.usedFor ? ` · ${t('admin.vouchers.usedFor', { when: v.usedFor })}` : ''}
                {v.note ? ` · “${v.note}”` : ''}{v.void_reason ? ` · ${t('admin.vouchers.voided', { reason: v.void_reason })}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-md border text-xs ${STATUS_STYLE[v.status] || ''}`}>{STATUSES.includes(v.status) ? t(`admin.vouchers.status.${v.status}`) : v.status}</span>
              {v.status === 'active' && (
                <button onClick={() => { setVoiding(v); setVoidReason('') }} className="px-3 py-1.5 rounded-lg text-sm border border-red-500/50 text-red-300">{t('admin.vouchers.void')}</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {voiding && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setVoiding(null)}>
          <div className="bg-[#111d38] border border-[#1e3a6e] rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-white font-bold text-lg">{t('admin.vouchers.voidTitle')}</h2>
            <p className="text-gray-400 text-sm mt-1">{voiding.family} · {voiding.swimmers.join(' & ')} · {kindOf(t, voiding)} · {t('admin.vouchers.useBy')} {voiding.expires_on}</p>
            <textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} placeholder={t('admin.vouchers.whyRequired')}
              className="mt-4 w-full rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white text-sm p-3" rows={3} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setVoiding(null)} className="flex-1 px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm">{t('admin.vouchers.keepIt')}</button>
              <button disabled={busy || !voidReason.trim()} onClick={async () => { if (await post({ action: 'void', id: voiding.id, reason: voidReason })) setVoiding(null) }}
                className="flex-1 px-3 py-2 rounded-lg bg-red-500/80 text-white text-sm font-semibold disabled:opacity-50">{t('admin.vouchers.void')}</button>
            </div>
          </div>
        </div>
      )}

      {issuing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setIssuing(false)}>
          <div className="bg-[#111d38] border border-[#1e3a6e] rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-white font-bold text-lg">{t('admin.vouchers.issueTitle')}</h2>
            <div className="mt-4 space-y-3 text-sm">
              <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value, student_id: '', student2_id: '' }))}
                className="w-full rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white p-2.5">
                <option value="">{t('admin.vouchers.pickFamily')}</option>
                {families.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <select value={form.course_slug} onChange={e => setForm(f => ({ ...f, course_slug: e.target.value, minutes: 30, student2_id: '' }))}
                className="w-full rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white p-2.5">
                <option value="1on1">{t('admin.vouchers.kind.1on1')}</option><option value="1on2">{t('admin.vouchers.kind.1on2Family')}</option><option value="1on4">{t('admin.vouchers.kind.1on4')}</option>
              </select>
              {form.course_slug === '1on1' && (
                <div className="flex gap-2">
                  {[30, 60].map(m => (
                    <button key={m} onClick={() => setForm(f => ({ ...f, minutes: m }))}
                      className={`flex-1 px-3 py-2 rounded-lg border ${form.minutes === m ? 'border-[#c9a84c] text-[#c9a84c]' : 'border-[#1e3a6e] text-gray-400'}`}>{t('admin.vouchers.minutes', { n: m })}</button>
                  ))}
                </div>
              )}
              <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))} disabled={!fam}
                className="w-full rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white p-2.5 disabled:opacity-50">
                <option value="">{t('admin.vouchers.pickSwimmer')}</option>
                {(fam?.students || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {form.course_slug === '1on2' && (
                <select value={form.student2_id} onChange={e => setForm(f => ({ ...f, student2_id: e.target.value }))} disabled={!fam}
                  className="w-full rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white p-2.5 disabled:opacity-50">
                  <option value="">{t('admin.vouchers.pickSecondSwimmer')}</option>
                  {(fam?.students || []).filter(s => s.id !== form.student_id).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <label className="block text-gray-400 text-xs">{t('admin.vouchers.useByLabel')}
                <input type="date" value={form.expires_on} min={today} onChange={e => setForm(f => ({ ...f, expires_on: e.target.value }))}
                  className="mt-1 w-full rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white p-2.5" />
              </label>
              <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder={t('admin.vouchers.noteRequired')}
                className="w-full rounded-lg bg-[#0d1529] border border-[#1e3a6e] text-white p-3" rows={2} />
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setIssuing(false)} className="flex-1 px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm">{t('common.cancel')}</button>
              <button disabled={busy || !form.parent_id || !form.student_id || !form.note.trim() || (form.course_slug === '1on2' && !form.student2_id)}
                onClick={async () => { if (await post({ action: 'issue', ...form, student2_id: form.student2_id || null, expires_on: form.expires_on || null })) { setIssuing(false); setForm({ parent_id: '', student_id: '', student2_id: '', course_slug: '1on1', minutes: 30, expires_on: '', note: '' }) } }}
                className="flex-1 px-3 py-2 rounded-lg bg-[#c9a84c] text-[#111d38] text-sm font-semibold disabled:opacity-50">{t('admin.vouchers.issue')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
