'use client'

import { useState, useEffect } from 'react'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

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

export default function PartnershipSection({ parentId }: { parentId: string }) {
  const [partnerships, setPartnerships] = useState<Partnership[]>([])
  const [partnerStudents, setPartnerStudents] = useState<PartnerStudent[]>([])
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
    if (!res.ok) { setJoinError(data.error || 'Failed to link accounts'); return }
    setJoinSuccess(true)
    setInputCode('')
    await load()
  }

  const handleRevoke = async () => {
    if (!revokeId) return
    const res = await fetch('/api/partnerships/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partnership_id: revokeId }),
    })
    if (res.ok) {
      setRevokeId(null)
      setRevokeConfirm(false)
      await load()
    }
  }

  useEffect(() => { load() }, [])

  const getPartnerParentId = (p: Partnership) =>
    p.initiator_parent_id === parentId ? p.partner_parent_id : p.initiator_parent_id

  const studentsForPartner = (partnerParentId: string) =>
    partnerStudents.filter(s => s.parent_id === partnerParentId)

  return (
    <section style={{ marginBottom: '36px' }}>
      <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 16px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
        Account Linking
      </h2>

      {/* Linked accounts */}
      {partnerships.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
          {partnerships.map(p => {
            const partnerParentId = getPartnerParentId(p)
            const students = studentsForPartner(partnerParentId)
            return (
              <div key={p.id} style={{
                background: DARK, border: '1px solid rgba(201,168,76,0.2)',
                borderRadius: '14px', padding: '16px 20px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: `${GOLD}20`, border: `1px solid ${GOLD}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', flexShrink: 0 }}>
                    🤝
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: GOLD, marginBottom: '3px' }}>Linked Account</div>
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                      {students.length > 0 ? `Students: ${students.map(s => s.full_name).join(', ')}` : 'No students on their account yet'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setRevokeId(p.id); setRevokeConfirm(true) }}
                  style={{ color: '#f87171', fontSize: '12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '8px', padding: '6px 14px', cursor: 'pointer', flexShrink: 0, fontWeight: 600 }}>
                  Unlink
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Unlink confirmation modal */}
      {revokeConfirm && (
        <div onClick={() => { setRevokeConfirm(false); setRevokeId(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: DARK, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.12)', padding: '32px', maxWidth: '380px', width: '100%' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', color: '#f87171', marginBottom: '8px' }}>Unlink Account</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 900, color: '#fff', marginBottom: '12px' }}>Unlink this account?</div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: '24px' }}>After unlinking, neither side can see the other's students, and all pending cross-account bookings will be cancelled.</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setRevokeConfirm(false); setRevokeId(null) }}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleRevoke}
                style={{ flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#f87171', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                Yes, Unlink
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite code section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {/* My invite code */}
        <div style={{ background: DARK, border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>My Invite Code</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '16px', lineHeight: 1.5 }}>Send your invite code to the other parent; once they enter it, the accounts are linked</div>
          {myInviteCode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ background: 'rgba(201,168,76,0.1)', border: `1px solid ${GOLD}40`, borderRadius: '8px', padding: '8px 14px', color: GOLD, fontWeight: 700, fontSize: '16px', letterSpacing: '0.15em', flex: 1, textAlign: 'center' }}>
                {myInviteCode}
              </span>
              <button onClick={() => { navigator.clipboard.writeText(myInviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                style={{ background: copied ? '#4caf72' : GOLD, color: NAVY, border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <button onClick={getMyCode}
              style={{ width: '100%', background: GOLD, color: NAVY, border: 'none', borderRadius: '10px', padding: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
              Generate Invite Code
            </button>
          )}
        </div>

        {/* Enter invite code */}
        <div style={{ background: DARK, border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Enter Invite Code</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.35)', marginBottom: '16px', lineHeight: 1.5 }}>Enter the other parent's invite code to link accounts</div>
          {joinSuccess ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4caf72', fontWeight: 600, fontSize: '13px' }}>
              <span>✓</span><span>Accounts linked!</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  autoComplete="new-password"
                  type="text"
                  placeholder="MSA-XXXXXX"
                  value={inputCode}
                  onChange={e => setInputCode(e.target.value.toUpperCase())}
                  style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '8px 12px', color: '#fff', fontSize: '14px', outline: 'none', letterSpacing: '0.1em' }}
                />
                <button onClick={handleJoin} disabled={!inputCode.trim()}
                  style={{ background: inputCode.trim() ? GOLD : 'rgba(255,255,255,0.08)', color: inputCode.trim() ? NAVY : 'rgba(255,255,255,0.3)', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 700, fontSize: '13px', cursor: inputCode.trim() ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                  Link
                </button>
              </div>
              {joinError && <div style={{ fontSize: '12px', color: '#f87171', marginTop: '8px', padding: '6px 10px', background: 'rgba(248,113,113,0.08)', borderRadius: '6px' }}>{joinError}</div>}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
