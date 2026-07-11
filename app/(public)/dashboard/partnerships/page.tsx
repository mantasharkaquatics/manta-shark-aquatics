'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

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

export default function PartnershipsPage() {
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
    if (!res.ok) { setJoinError(data.error || 'Failed to link accounts'); return }
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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0d1529', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>Loading...</div>
    </div>
  )

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#0d1529', minHeight: '100vh' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: 'clamp(32px,5vw,64px) clamp(20px,5vw,40px)' }}>

        {/* Header */}
        <div style={{ marginBottom: '36px' }}>
          <Link href="/dashboard" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
            ← Back to Dashboard
          </Link>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(24px,4vw,32px)', fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>Account Linking</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>Link with another parent's account to book 1-on-2 lessons together</p>
        </div>

        {/* Linked accounts */}
        {partnerships.length > 0 && (
          <div style={{ marginBottom: '28px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>Linked Accounts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {partnerships.map(p => {
                const partnerParentId = getPartnerParentId(p)
                const students = studentsForPartner(partnerParentId)
                return (
                  <div key={p.id} style={{ background: DARK, border: `1px solid ${GOLD}25`, borderRadius: '14px', padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: `${GOLD}15`, border: `1px solid ${GOLD}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🤝</div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: GOLD, marginBottom: '3px' }}>Linked Account</div>
                        <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
                          {students.length > 0 ? `Students: ${students.map(s => s.full_name).join(', ')}` : 'No students on their account yet'}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { setRevokeId(p.id); setRevokeConfirm(true) }}
                      style={{ color: '#f87171', fontSize: '12px', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: '8px', padding: '7px 14px', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>
                      Unlink
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {partnerships.length === 0 && (
          <div style={{ background: DARK, border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '14px', padding: '32px', textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🤝</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'rgba(255,255,255,0.6)', marginBottom: '6px' }}>No linked accounts yet</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>Generate an invite code or enter theirs to get started</div>
          </div>
        )}

        {/* Invite code section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* My invite code */}
          <div style={{ background: DARK, border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>My Invite Code</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', marginBottom: '16px' }}>Send your invite code to the other parent; once they enter it, the accounts are linked</div>
            {myInviteCode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ flex: 1, background: `${GOLD}10`, border: `1px solid ${GOLD}35`, borderRadius: '10px', padding: '12px 16px', color: GOLD, fontWeight: 700, fontSize: '18px', letterSpacing: '0.2em', textAlign: 'center' }}>
                  {myInviteCode}
                </div>
                <button onClick={() => { navigator.clipboard.writeText(myInviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  style={{ background: copied ? '#4caf72' : GOLD, color: NAVY, border: 'none', borderRadius: '10px', padding: '12px 20px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}>
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            ) : (
              <button onClick={getMyCode}
                style={{ width: '100%', background: GOLD, color: NAVY, border: 'none', borderRadius: '10px', padding: '12px', fontWeight: 700, fontSize: '14px', cursor: 'pointer' }}>
                Generate Invite Code
              </button>
            )}
          </div>

          {/* Enter invite code */}
          <div style={{ background: DARK, border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Enter Invite Code</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.35)', marginBottom: '16px' }}>Enter the other parent's invite code to link accounts</div>
            {joinSuccess ? (
              <div style={{ color: '#4caf72', fontWeight: 600, fontSize: '14px' }}>✓ Accounts linked!</div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    autoComplete="new-password"
                    type="text"
                    placeholder="MSA-XXXXXX"
                    value={inputCode}
                    onChange={e => setInputCode(e.target.value.toUpperCase())}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '12px 14px', color: '#fff', fontSize: '15px', outline: 'none', letterSpacing: '0.1em' }}
                  />
                  <button onClick={handleJoin} disabled={!inputCode.trim()}
                    style={{ background: inputCode.trim() ? GOLD : 'rgba(255,255,255,0.08)', color: inputCode.trim() ? NAVY : 'rgba(255,255,255,0.3)', border: 'none', borderRadius: '10px', padding: '12px 20px', fontWeight: 700, fontSize: '14px', cursor: inputCode.trim() ? 'pointer' : 'not-allowed', flexShrink: 0 }}>
                    Link
                  </button>
                </div>
                {joinError && <div style={{ fontSize: '12px', color: '#f87171', marginTop: '10px', padding: '8px 12px', background: 'rgba(248,113,113,0.08)', borderRadius: '8px' }}>{joinError}</div>}
              </>
            )}
          </div>
        </div>
      </div>

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
                Yes, Remove
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}
