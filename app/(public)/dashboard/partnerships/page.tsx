'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'
import { ACCT_CSS } from '@/components/brand/AcctStyles'

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
  const tErr = (raw?: string | null): string => {
    const k = errorKey(raw)
    return k ? t(k) : (raw || t('link.err.join'))
  }
  const [partnerships, setPartnerships] = useState<Partnership[]>([])
  const [partnerStudents, setPartnerStudents] = useState<PartnerStudent[]>([])
  const [parentId, setParentId] = useState<string | null>(null)
  const [myInviteCode, setMyInviteCode] = useState<string | null>(null)
  const [inputCode, setInputCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinSuccess, setJoinSuccess] = useState(false)
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [revokeConfirm, setRevokeConfirm] = useState(false)

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
    }
  }

  const handleJoin = async () => {
    setJoinError(null)
    const res = await fetch('/api/partnerships/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: inputCode.trim().toUpperCase() }),
    })
    const data = await res.json()
    if (!res.ok) { setJoinError(tErr(data.error)); return }
    setJoinSuccess(true)
    setInputCode('')
    await load()
  }

  const handleRevoke = async () => {
    if (!revokeId) return
    await fetch('/api/partnerships/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnership_id: revokeId }),
    })
    setRevokeId(null)
    setRevokeConfirm(false)
    await load()
  }

  useEffect(() => { load() }, [])

  const getPartnerParentId = (p: Partnership) =>
    p.initiator_parent_id === parentId ? p.partner_parent_id : p.initiator_parent_id

  const studentsForPartner = (partnerParentId: string) =>
    partnerStudents.filter(s => s.parent_id === partnerParentId)

  const closeRevoke = () => { setRevokeConfirm(false); setRevokeId(null) }

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
                  <button type="button" className="ac-btn gold" onClick={handleJoin} disabled={!inputCode.trim()}>{t('link.linkBtn')}</button>
                </div>
                {joinError && <div className="ac-err">{joinError}</div>}
              </>
            )}
          </section>
        </div>
      </div>

      {/* Unlink confirmation */}
      {revokeConfirm && (
        <div className="ac-back-drop" onClick={closeRevoke}>
          <div className="ac-modal" role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}>
            <div className="eyebrow">{t('link.unlinkEyebrow')}</div>
            <h2>{t('link.unlinkTitle')}</h2>
            <p>{t('link.unlinkDesc')}</p>
            <div className="ac-pair">
              <button type="button" className="ac-btn line" onClick={closeRevoke}>{t('common.cancel')}</button>
              <button type="button" className="ac-btn dangerFill" onClick={handleRevoke}>{t('link.confirmUnlink')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
