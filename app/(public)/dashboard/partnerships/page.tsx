'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { dateTag } from '@/lib/i18n'
import { errorKey } from '@/lib/i18n/errors'
import { ACCT_CSS } from '@/components/brand/AcctStyles'
import { useDialogFocus } from '@/lib/use-dialog-focus'

type Partnership = {
  id: string
  initiator_parent_id: string
  partner_parent_id: string
  status: string
  invite_code: string
}

type PartnerStudent = {
  id: string
  full_name: string
  parent_id: string
}

export default function PartnershipsPage() {
  const t = useT()
  const locale = useLocale()
  const tErr = (raw?: string | null): string => {
    const k = errorKey(raw)
    return k ? t(k) : (raw || t('link.err.join'))
  }
  const [partnerships, setPartnerships] = useState<Partnership[]>([])
  const [partnerStudents, setPartnerStudents] = useState<PartnerStudent[]>([])
  const [parentId, setParentId] = useState<string | null>(null)
  const [myInviteCode, setMyInviteCode] = useState<string | null>(null)
  // A code works for INVITE_CODE_DAYS (lib/partnerships.ts) from when it was
  // made; the route sends the end date (owner 2026-10-16, audit F68).
  const [myCodeExpires, setMyCodeExpires] = useState<string | null>(null)
  const [inputCode, setInputCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinSuccess, setJoinSuccess] = useState(false)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [revokeConfirm, setRevokeConfirm] = useState(false)
  // Busy flags and the unlink error (found 2026-10-05): Join and Unlink could
  // be pressed again while the request was out, and a failed unlink closed the
  // dialog as if it had worked.
  const [joinBusy, setJoinBusy] = useState(false)
  const [revokeBusy, setRevokeBusy] = useState(false)
  const [revokeError, setRevokeError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/partnerships/list')
    if (res.ok) {
      const data = await res.json()
      setPartnerships(data.partnerships || [])
      setPartnerStudents(data.partner_students || [])
      setParentId(data.my_parent_id || null)
    }
    setLoading(false)
  }

  const getMyCode = async () => {
    const res = await fetch('/api/partnerships/invite', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setMyInviteCode(data.invite_code)
      setMyCodeExpires(typeof data.expires_at === 'string' ? data.expires_at : null)
    }
  }

  const handleJoin = async () => {
    if (joinBusy) return
    setJoinError(null)
    setJoinBusy(true)
    try {
      const res = await fetch('/api/partnerships/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invite_code: inputCode.trim().toUpperCase() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setJoinError(data.code === 'code_expired' ? t('err.inviteCodeExpired') : tErr(data.error)); return }
      setJoinSuccess(true)
      setInputCode('')
      await load()
    } catch {
      setJoinError(t('cart.err.network'))
    } finally {
      setJoinBusy(false)
    }
  }

  const handleRevoke = async () => {
    if (!revokeId || revokeBusy) return
    setRevokeError(null)
    setRevokeBusy(true)
    try {
      const res = await fetch('/api/partnerships/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnership_id: revokeId }),
      })
      if (!res.ok) {
        // Stay in the dialog and say so; never show the route's raw English.
        const data = await res.json().catch(() => ({}))
        const k = errorKey(data.error)
        setRevokeError(k ? t(k) : t('link.err.unlink'))
        return
      }
      setRevokeId(null)
      setRevokeConfirm(false)
      await load()
    } catch {
      setRevokeError(t('cart.err.network'))
    } finally {
      setRevokeBusy(false)
    }
  }

  useEffect(() => { load() }, [])

  const getPartnerParentId = (p: Partnership) =>
    p.initiator_parent_id === parentId ? p.partner_parent_id : p.initiator_parent_id

  const studentsForPartner = (partnerParentId: string) =>
    partnerStudents.filter(s => s.parent_id === partnerParentId)

  const closeRevoke = () => { if (revokeBusy) return; setRevokeConfirm(false); setRevokeId(null); setRevokeError(null) }
  /* The unlink confirm had no name, no focus and no Esc (found 2026-10-15). */
  const revokeBox = useDialogFocus(revokeConfirm, closeRevoke)

  if (loading) return (
    <div className="ac-root ac-loading">
      <style>{ACCT_CSS}</style>
      {t('link.loading')}
    </div>
  )

  return (
    <div className="ac-root">
      <style>{ACCT_CSS}</style>
      <div className="ac-wrap">

        <div className="ac-head">
          <Link href="/dashboard" className="ac-back">← {t('common.backToDashboard')}</Link>
          <h1 className="ac-h1">{t('link.title')}</h1>
          <p className="ac-sub">{t('link.subtitle')}</p>
        </div>

        <div className="ac-stack">
          {/* Linked families */}
          {partnerships.length > 0 ? (
            <section className="ac-card">
              <p className="ac-label">{t('link.linkedAccounts')}</p>
              <div className="ac-stack" style={{ gap: 10, marginTop: 12 }}>
                {partnerships.map(p => {
                  const students = studentsForPartner(getPartnerParentId(p))
                  return (
                    <div key={p.id} className="ac-item ac-item-actions">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div className="ac-icon" aria-hidden="true">🤝</div>
                        <div>
                          <b>{t('link.linkedAccount')}</b>
                          <small>{students.length > 0 ? t('link.students', { names: students.map(s => s.full_name).join(', ') }) : t('link.noStudents')}</small>
                        </div>
                      </div>
                      <button type="button" className="ac-btn danger" onClick={() => { setRevokeId(p.id); setRevokeConfirm(true) }}>
                        {t('link.unlink')}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : (
            <section className="ac-card ac-empty">
              <div className="ac-icon" style={{ margin: '0 auto' }} aria-hidden="true">🤝</div>
              <b>{t('link.emptyTitle')}</b>
              <small className="ac-sub" style={{ fontSize: 14 }}>{t('link.emptyDesc')}</small>
            </section>
          )}

          {/* My invite code */}
          <section className="ac-card">
            <p className="ac-label">{t('link.myCode')}</p>
            <p className="ac-desc">{t('link.myCodeDesc')}</p>
            {myInviteCode ? (
              <div className="ac-row ac-codeRow" style={{ gap: 10 }}>
                <div className="ac-code">{myInviteCode}</div>
                <button type="button" className={'ac-btn ' + (copied ? 'ok' : 'gold')}
                  onClick={() => { navigator.clipboard.writeText(myInviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                  {copied ? '✓ ' + t('link.copied') : t('link.copy')}
                </button>
              </div>
            ) : (
              <button type="button" className="ac-btn gold block" onClick={getMyCode}>{t('link.generateCode')}</button>
            )}
            {myInviteCode && myCodeExpires && (
              <p className="ac-note" style={{ marginTop: 10 }}>
                {t('link.codeValidUntil', { date: new Date(myCodeExpires).toLocaleDateString(dateTag(locale), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }) })}
              </p>
            )}
          </section>

          {/* Enter a code */}
          <section className="ac-card">
            <p className="ac-label">{t('link.enterCode')}</p>
            <p className="ac-desc">{t('link.enterCodeDesc')}</p>
            {joinSuccess ? (
              <div className="ac-okmsg">✓ {t('link.linked')}</div>
            ) : (
              <>
                <div className="ac-row ac-joinRow" style={{ gap: 10 }}>
                  <input className="ac-input" autoComplete="new-password" type="text" placeholder="MSA-XXXXXX"
                    aria-label={t('link.enterCode')} value={inputCode}
                    onChange={e => setInputCode(e.target.value.toUpperCase())} style={{ letterSpacing: '0.1em', flex: 1 }} />
                  <button type="button" className="ac-btn gold" onClick={handleJoin} disabled={!inputCode.trim() || joinBusy} aria-busy={joinBusy}>{joinBusy ? t('link.linking') : t('link.linkBtn')}</button>
                </div>
                {joinError && <div className="ac-err" role="alert">{joinError}</div>}
              </>
            )}
          </section>
        </div>
      </div>

      {/* Unlink confirmation */}
      {revokeConfirm && (
        <div className="ac-back-drop" onClick={closeRevoke}>
          <div ref={revokeBox} className="ac-modal" role="dialog" aria-modal="true" aria-labelledby="link-unlink-title" onClick={e => e.stopPropagation()}>
            <div className="eyebrow">{t('link.unlinkEyebrow')}</div>
            <h2 id="link-unlink-title">{t('link.unlinkTitle')}</h2>
            <p>{t('link.unlinkDesc')}</p>
            {revokeError && <div className="ac-err" role="alert">{revokeError}</div>}
            <div className="ac-pair">
              <button type="button" className="ac-btn line" onClick={closeRevoke} disabled={revokeBusy}>{t('common.cancel')}</button>
              <button type="button" className="ac-btn dangerFill" onClick={handleRevoke} disabled={revokeBusy} aria-busy={revokeBusy}>{revokeBusy ? t('link.unlinking') : t('link.confirmUnlink')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
