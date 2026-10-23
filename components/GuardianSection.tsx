'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/provider'

/* Family members on My Account (owner, 2026-10-22; roles 2026-10-23;
   lib/guardians.ts). The main account invites, resends and removes, and
   picks each one's role: 全部權限 (one, the main account's rights) or 只能看
   (up to two, the schedule and learning only). A guardian sees who is on
   the account and that only the main account changes it. Uses the account
   page's ac-* styles (components/brand/AcctStyles). */

type Role = 'full' | 'viewer'
type G = { id: string; first_name: string | null; last_name: string | null; email: string; signed_in: boolean; role?: Role }
type State = { me: 'main' | 'guardian'; myRole?: 'main' | Role; myGuardianId: string | null; guardians: G[]; available: boolean; max: number | Record<Role, number> }

const ERR = new Set(['email_taken', 'bad_email', 'limit', 'too_soon'])

export default function GuardianSection({ mainName }: { mainName: string }) {
  const t = useT()
  const [s, setS] = useState<State | null>(null)
  const [open, setOpen] = useState(false)
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [role, setRole] = useState<Role>('full')

  const load = () => fetch('/api/parent/guardian', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null)).then(d => { if (d) setS(d) }).catch(() => {})
  useEffect(() => { load() }, [])

  if (!s || !s.available) return null
  const nameOf = (g: G) => `${g.first_name || ''} ${g.last_name || ''}`.trim() || g.email
  const errText = (code?: string) => t(ERR.has(code || '') ? `account.guardian.err.${code}` : 'account.guardian.err.generic')

  async function invite() {
    setBusy(true); setErr(null); setOk(null)
    try {
      const r = await fetch('/api/parent/guardian', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: first.trim(), last_name: last.trim(), email: email.trim(), role }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(errText(j.code)); return }
      setOk(j.invited ? t('account.guardian.sent', { email: email.trim() }) : t('account.guardian.notSent', { name: first.trim() }))
      setOpen(false); setFirst(''); setLast(''); setEmail('')
      await load()
    } catch { setErr(errText()) } finally { setBusy(false) }
  }

  async function resend(g: G) {
    setBusy(true); setErr(null); setOk(null)
    try {
      const r = await fetch('/api/parent/guardian', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: g.id, action: 'resend' }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErr(errText(j.code)); else setOk(t('account.guardian.resent'))
    } catch { setErr(errText()) } finally { setBusy(false) }
  }

  async function remove(g: G) {
    setBusy(true); setErr(null); setOk(null)
    try {
      const r = await fetch(`/api/parent/guardian?id=${encodeURIComponent(g.id)}`, { method: 'DELETE' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(errText(j.code)); return }
      setConfirming(null)
      setOk(t('account.guardian.removed', { name: nameOf(g) }))
      await load()
    } catch { setErr(errText()) } finally { setBusy(false) }
  }

  const main = s.me === 'main'
  // An older server answered one number for the one guardian it allowed.
  const max: Record<Role, number> = typeof s.max === 'number' ? { full: s.max, viewer: 0 } : s.max
  const roleOf = (g: G): Role => (g.role === 'viewer' ? 'viewer' : 'full')
  const room = (r: Role) => s.guardians.filter(g => roleOf(g) === r).length < (max[r] || 0)
  const canAdd = main && (room('full') || room('viewer'))
  const openForm = () => { setOk(null); setErr(null); setRole(room('full') ? 'full' : 'viewer'); setOpen(true) }

  return (
    <section className="ac-card">
      <p className="ac-label">{t('account.guardian.title')}</p>
      {main
        ? <p className="ac-note" style={{ marginTop: 0 }}>{t('account.guardian.desc')}</p>
        : <p className="ac-note" style={{ marginTop: 0 }}>{t(s.myRole === 'viewer' ? 'account.guardian.youAreViewer' : 'account.guardian.youAre', { name: mainName })}</p>}

      {s.guardians.length > 0 && (
        <div className="ac-stack" style={{ gap: 10, marginTop: 12 }}>
          {s.guardians.map(g => (
            <div key={g.id} className="ac-item" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <b>{nameOf(g)}{g.id === s.myGuardianId ? ` (${t('account.guardian.you')})` : ''}</b>
                <small style={{ overflowWrap: 'anywhere' }}>{g.email}</small>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <div className="ac-tag">{t(roleOf(g) === 'viewer' ? 'account.guardian.roleViewer' : 'account.guardian.roleFull')}</div>
                  <div className="ac-tag">{t(g.signed_in ? 'account.guardian.active' : 'account.guardian.pending')}</div>
                </div>
              </div>
              {main && confirming !== g.id && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!g.signed_in && (
                    <button type="button" className="ac-btn line" style={{ width: 'auto', padding: '8px 14px' }} disabled={busy} onClick={() => resend(g)}>
                      {t('account.guardian.resend')}
                    </button>
                  )}
                  <button type="button" className="ac-btn line" style={{ width: 'auto', padding: '8px 14px', color: '#b4321f' }} disabled={busy}
                    onClick={() => { setOk(null); setErr(null); setConfirming(g.id) }}>
                    {t('account.guardian.remove')}
                  </button>
                </div>
              )}
              {main && confirming === g.id && (
                <div style={{ flexBasis: '100%' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 14, color: '#16294a' }}>{t('account.guardian.removeConfirm', { name: nameOf(g) })}</p>
                  <div className="ac-pair">
                    <button type="button" className="ac-btn line" disabled={busy} onClick={() => setConfirming(null)}>{t('common.cancel')}</button>
                    <button type="button" className="ac-btn gold" disabled={busy} onClick={() => remove(g)}>
                      {busy ? t('account.guardian.removing') : t('account.guardian.remove')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {ok && <div className="ac-okmsg" role="status" style={{ marginTop: 10 }}>✓ {ok}</div>}
      {err && !open && <div className="ac-err" role="alert" style={{ marginTop: 10 }}>{err}</div>}

      {canAdd && !open && (
        <button type="button" className="ac-add" onClick={openForm}>
          + {t('account.guardian.invite')}
        </button>
      )}
      {canAdd && open && (
        <div className="ac-item" style={{ display: 'block', marginTop: 12 }}>
          <fieldset style={{ border: 'none', margin: '0 0 14px', padding: 0 }}>
            <legend className="ac-flabel" style={{ padding: 0 }}>{t('account.guardian.roleLabel')}</legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(['full', 'viewer'] as Role[]).map(r => {
                const full = !room(r)
                return (
                  <label key={r} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10,
                    border: `1px solid ${role === r ? '#2050a0' : '#d5e0ef'}`, background: role === r ? '#eef4fc' : '#fff',
                    cursor: full ? 'not-allowed' : 'pointer', opacity: full ? 0.55 : 1 }}>
                    <input type="radio" name="gd-role" value={r} checked={role === r} disabled={full}
                      onChange={() => setRole(r)} style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0, accentColor: '#2050a0' }} />
                    <span style={{ fontSize: 14, color: '#16294a', lineHeight: 1.5 }}>
                      <b>{t(r === 'viewer' ? 'account.guardian.roleViewer' : 'account.guardian.roleFull')}</b>
                      {' · '}{t(r === 'viewer' ? 'account.guardian.roleViewerLeft' : 'account.guardian.roleFullLeft', { n: max[r] - s.guardians.filter(g => roleOf(g) === r).length })}
                      <span style={{ display: 'block', color: '#56647d', fontSize: 13 }}>{t(r === 'viewer' ? 'account.guardian.roleViewerDesc' : 'account.guardian.roleFullDesc')}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          <div className="ac-pair" style={{ marginBottom: 12 }}>
            <div>
              <label className="ac-flabel" htmlFor="gd-first">{t('account.guardian.firstName')}</label>
              <input id="gd-first" className="ac-input" type="text" autoComplete="off" maxLength={60} value={first} onChange={e => setFirst(e.target.value)} />
            </div>
            <div>
              <label className="ac-flabel" htmlFor="gd-last">{t('account.guardian.lastName')}</label>
              <input id="gd-last" className="ac-input" type="text" autoComplete="off" maxLength={60} value={last} onChange={e => setLast(e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label className="ac-flabel" htmlFor="gd-email">{t('account.guardian.email')}</label>
            <input id="gd-email" className="ac-input" type="email" inputMode="email" autoComplete="off" maxLength={200} value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <p className="ac-note" style={{ marginTop: 0, marginBottom: 12 }}>{t('account.guardian.hint')}</p>
          {err && <div className="ac-err" role="alert" style={{ marginTop: 0, marginBottom: 12 }}>{err}</div>}
          <div className="ac-pair">
            <button type="button" className="ac-btn line" disabled={busy} onClick={() => { setOpen(false); setErr(null) }}>{t('common.cancel')}</button>
            <button type="button" className="ac-btn gold" disabled={busy || !first.trim() || !last.trim() || !email.trim()} onClick={invite}>
              {busy ? t('account.guardian.sending') : t('account.guardian.send')}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
