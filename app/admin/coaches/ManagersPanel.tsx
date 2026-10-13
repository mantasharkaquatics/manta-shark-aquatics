'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/provider'

/* Manager (admin) accounts under the coach list (owner, 2026-10-13). Only the
   owner's account sees it: /api/admin/staff answers 403 to everyone else and
   the panel then renders nothing. */

type Manager = {
  id: string
  first_name: string
  last_name: string
  email: string
  owner: boolean
  active: boolean
  signed_in: boolean | null
  me: boolean
}

const ERR: Record<string, string> = {
  missing_fields: 'admin.staff.err.missingFields',
  bad_email: 'admin.coaches.err.badEmail',
  same_email: 'admin.coaches.err.sameEmail',
  email_taken: 'admin.coaches.err.emailTaken',
  no_login: 'admin.coaches.err.noLogin',
  self: 'admin.staff.err.self',
  owner: 'admin.staff.err.owner',
  also_coach: 'admin.staff.err.alsoCoach',
  disabled: 'admin.staff.err.disabled',
}

const inputCls = "w-full bg-[#111d38] border border-[#1e3a6e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-[#c9a84c]"
const smallBtn = "text-xs px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-400 hover:border-[#c9a84c]/50 hover:text-[#c9a84c] transition-all disabled:opacity-50"

export default function ManagersPanel() {
  const t = useT()
  // null = not loaded; 'hidden' = not the owner; 'error' = could not load.
  const [list, setList] = useState<Manager[] | null | 'hidden' | 'error'>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editEmail, setEditEmail] = useState('')
  const [confirmOff, setConfirmOff] = useState<Manager | null>(null)

  const load = async () => {
    const res = await fetch('/api/admin/staff').catch(() => null)
    if (res?.status === 403) { setList('hidden'); return }
    const data = res?.ok ? await res.json().catch(() => null) : null
    setList(data?.managers ? data.managers : 'error')
  }
  useEffect(() => { load() }, [])

  const fail = (code: unknown) => setError(t(ERR[String(code || '')] || 'admin.staff.err.failed'))

  const send = async (method: 'POST' | 'PATCH', body: Record<string, unknown>) => {
    setBusy(true); setError(null); setNotice(null)
    const res = await fetch('/api/admin/staff', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null)
    const data = res ? await res.json().catch(() => ({})) : {}
    setBusy(false)
    return { ok: !!res?.ok, data }
  }

  const add = async () => {
    const { ok, data } = await send('POST', form)
    if (!ok) { fail(data.code); return }
    setNotice(data.invited ? t('admin.staff.created', { email: form.email.trim().toLowerCase() }) : t('admin.staff.createdNoMail'))
    setForm({ first_name: '', last_name: '', email: '' })
    setShowAdd(false)
    load()
  }

  const saveEmail = async (m: Manager) => {
    const { ok, data } = await send('PATCH', { id: m.id, action: 'email', email: editEmail })
    if (!ok) { fail(data.code); return }
    setEditId(null); setEditEmail('')
    setNotice(t('admin.coaches.emailChanged'))
    load()
  }

  const setActive = async (m: Manager, on: boolean) => {
    const { ok, data } = await send('PATCH', { id: m.id, action: on ? 'enable' : 'disable' })
    setConfirmOff(null)
    if (!ok) { fail(data.code); return }
    load()
  }

  const resend = async (m: Manager) => {
    const { ok, data } = await send('PATCH', { id: m.id, action: 'resend_invite' })
    if (!ok) { fail(data.code); return }
    setNotice(t('admin.staff.inviteSent', { email: m.email }))
  }

  if (list === null || list === 'hidden') return null

  return (
    <section className="mt-10" aria-labelledby="managers-title">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 id="managers-title" className="text-xl font-bold text-white font-['Playfair_Display']">{t('admin.staff.title')}</h2>
          <p className="text-gray-400 text-sm mt-1">{t('admin.staff.hint')}</p>
        </div>
        <button onClick={() => { setShowAdd(!showAdd); setError(null); setNotice(null) }}
          className="bg-[#c9a84c] hover:bg-[#b8963e] text-[#111d38] font-semibold px-4 py-2 rounded-lg text-sm transition-all">
          {showAdd ? t('common.cancel') : t('admin.staff.add')}
        </button>
      </div>

      {confirmOff && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { if (!busy) setConfirmOff(null) }}>
          <div role="dialog" aria-modal="true" aria-labelledby="disable-title" className="bg-[#111d38] border border-[#1e3a6e] rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 id="disable-title" className="text-white font-bold text-lg">
              {t('admin.staff.disableTitle', { name: `${confirmOff.first_name} ${confirmOff.last_name}`.trim() })}
            </h2>
            <p className="text-gray-400 text-sm mt-2 leading-relaxed">{t('admin.staff.disableBody')}</p>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setConfirmOff(null)} disabled={busy}
                className="flex-1 px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm disabled:opacity-50">{t('common.cancel')}</button>
              <button onClick={() => setActive(confirmOff, false)} disabled={busy}
                className="flex-1 px-3 py-2 rounded-lg border border-red-400/60 bg-red-500/20 text-red-200 text-sm font-semibold disabled:opacity-50">
                {t('admin.staff.disable')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="bg-[#111d38] border border-[#1e3a6e] rounded-xl p-5 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <input placeholder={t('admin.staff.ph.firstName')} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className={inputCls} />
            <input placeholder={t('admin.staff.ph.lastName')} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className={inputCls} />
            <input type="email" placeholder={t('admin.staff.ph.email')} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </div>
          <button onClick={add} disabled={busy}
            className="bg-[#c9a84c] hover:bg-[#b8963e] disabled:opacity-50 text-[#111d38] font-semibold px-5 py-2 rounded-lg text-sm transition-all">
            {busy ? t('admin.staff.creating') : t('admin.staff.create')}
          </button>
        </div>
      )}

      {error && <p role="alert" className="text-red-400 text-sm mb-3">{error}</p>}
      {notice && <p role="status" className="text-green-400 text-sm mb-3">{notice}</p>}

      {list === 'error' ? (
        <p className="text-red-400 text-sm">{t('admin.staff.err.load')}</p>
      ) : (
        <div className="space-y-3">
          {list.map(m => (
            <div key={m.id} className={`bg-[#111d38] border rounded-xl p-4 flex items-center justify-between flex-wrap gap-3 ${m.active ? 'border-[#1e3a6e]' : 'border-[#1e3a6e]/40 opacity-60'}`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-[#1e3a6e] flex items-center justify-center shrink-0">
                  <span className="text-[#c9a84c] font-bold">{m.first_name.charAt(0)}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-white font-medium">
                    {m.first_name} {m.last_name}
                    {m.owner && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[#c9a84c]/20 text-[#c9a84c]">{t('admin.staff.owner')}</span>}
                    {m.me && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-[#1e3a6e] text-gray-300">{t('admin.staff.you')}</span>}
                    {!m.active && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">{t('admin.staff.disabled')}</span>}
                    {m.active && m.signed_in === false && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300">{t('admin.staff.notSignedIn')}</span>}
                  </p>
                  <p className="text-gray-500 text-xs break-all">{m.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {editId === m.id ? (
                  <>
                    <input type="email" placeholder={t('admin.coaches.ph.newEmail')} value={editEmail} autoFocus
                      onChange={e => setEditEmail(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !busy) saveEmail(m) }}
                      className="bg-[#0d1529] border border-[#1e3a6e] rounded-lg px-3 py-1.5 text-sm text-white w-64 focus:outline-none focus:border-[#c9a84c]" />
                    <button onClick={() => saveEmail(m)} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg bg-[#c9a84c] text-[#111d38] font-semibold disabled:opacity-50">{t('common.save')}</button>
                    <button onClick={() => { setEditId(null); setEditEmail(''); setError(null) }} disabled={busy} className="text-xs px-3 py-1.5 rounded-lg border border-[#1e3a6e] text-gray-400">{t('common.cancel')}</button>
                  </>
                ) : m.active ? (
                  <>
                    {m.signed_in === false && (
                      <button onClick={() => resend(m)} disabled={busy} className={smallBtn}>{t('admin.staff.resendInvite')}</button>
                    )}
                    <button onClick={() => { setEditId(m.id); setEditEmail(m.email); setError(null); setNotice(null) }} disabled={busy} className={smallBtn}>
                      {t('admin.coaches.changeEmail')}
                    </button>
                    {!m.owner && !m.me && (
                      <button onClick={() => { setError(null); setNotice(null); setConfirmOff(m) }} disabled={busy}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-400/40 text-red-300 hover:bg-red-400/10 transition-all disabled:opacity-50">
                        {t('admin.staff.disable')}
                      </button>
                    )}
                  </>
                ) : (
                  <button onClick={() => setActive(m, true)} disabled={busy}
                    className="text-xs px-3 py-1.5 rounded-lg border border-green-400/40 text-green-300 hover:bg-green-400/10 transition-all disabled:opacity-50">
                    {t('admin.staff.enable')}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
