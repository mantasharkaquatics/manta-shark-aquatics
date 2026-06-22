'use client'

import { useState, useEffect } from 'react'

const NAVY = '#1a2744'
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
    if (!res.ok) { setJoinError(data.error || '連動失敗'); return }
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
        帳戶連動
      </h2>

      {/* 已連動帳戶 */}
      {partnerships.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {partnerships.map(p => {
            const partnerParentId = getPartnerParentId(p)
            const students = studentsForPartner(partnerParentId)
            return (
              <div key={p.id} style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: '16px 20px', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ color: GOLD, fontWeight: 600, fontSize: 14, margin: '0 0 4px' }}>已連動帳戶</p>
                  {students.length > 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>
                      學生：{students.map(s => s.full_name).join('、')}
                    </p>
                  ) : (
                    <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>對方尚無學生資料</p>
                  )}
                </div>
                <button
                  onClick={() => { setRevokeId(p.id); setRevokeConfirm(true) }}
                  style={{ color: '#f87171', fontSize: 13, background: 'none', border: '1px solid #f87171', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>
                  解除連動
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* 解除確認 */}
      {revokeConfirm && (
        <div style={{ backgroundColor: '#1a0a0a', border: '1px solid #f87171', borderRadius: 12, padding: '16px 20px', marginBottom: 20 }}>
          <p style={{ color: '#f87171', fontWeight: 600, margin: '0 0 12px' }}>確定要解除連動？</p>
          <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 16px' }}>解除後，雙方將無法再看到對方的學生，所有 pending 中的跨帳戶預約也會取消。</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={handleRevoke}
              style={{ backgroundColor: '#f87171', color: 'white', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600, cursor: 'pointer' }}>
              確定解除
            </button>
            <button onClick={() => { setRevokeConfirm(false); setRevokeId(null) }}
              style={{ backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer' }}>
              取消
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 我的邀請碼 */}
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ color: 'white', fontWeight: 600, fontSize: 14, margin: '0 0 8px' }}>我的邀請碼</p>
          <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 12px' }}>把邀請碼傳給對方，讓他們輸入後即可連動帳戶</p>
          {myInviteCode ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ backgroundColor: '#0d1829', border: '1px solid #1e3a6e', borderRadius: 8, padding: '8px 14px', color: GOLD, fontWeight: 700, fontSize: 16, letterSpacing: '0.1em' }}>
                {myInviteCode}
              </span>
              <button onClick={() => { navigator.clipboard.writeText(myInviteCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                style={{ backgroundColor: copied ? '#10b981' : GOLD, color: NAVY, border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {copied ? '已複製 ✓' : '複製'}
              </button>
            </div>
          ) : (
            <button onClick={getMyCode}
              style={{ backgroundColor: GOLD, color: NAVY, border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600, cursor: 'pointer' }}>
              產生邀請碼
            </button>
          )}
        </div>

        {/* 輸入邀請碼 */}
        <div style={{ backgroundColor: '#111d38', border: '1px solid #1e3a6e', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ color: 'white', fontWeight: 600, fontSize: 14, margin: '0 0 8px' }}>輸入邀請碼</p>
          <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 12px' }}>輸入對方的邀請碼來連動帳戶</p>
          {joinSuccess ? (
            <p style={{ color: '#10b981', fontWeight: 600 }}>✓ 連動成功！</p>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder="MSA-XXXXXX"
                value={inputCode}
                onChange={e => setInputCode(e.target.value.toUpperCase())}
                style={{ flex: 1, backgroundColor: '#0d1829', border: '1px solid #1e3a6e', borderRadius: 8, padding: '8px 12px', color: 'white', fontSize: 14, outline: 'none' }}
              />
              <button onClick={handleJoin} disabled={!inputCode.trim()}
                style={{ backgroundColor: inputCode.trim() ? GOLD : '#374151', color: inputCode.trim() ? NAVY : '#6b7280', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: inputCode.trim() ? 'pointer' : 'not-allowed' }}>
                連動
              </button>
            </div>
          )}
          {joinError && <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{joinError}</p>}
        </div>
      </div>
    </section>
  )
}
