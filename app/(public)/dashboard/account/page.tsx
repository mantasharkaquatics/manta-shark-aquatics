'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

interface Parent {
  id: string; first_name: string; last_name: string; email: string; phone: string
  registered_at: string | null; newsletter_subscribed: boolean
}
interface Student { id: string; full_name: string; date_of_birth: string | null; added_by_parent?: boolean }

export default function AccountPage() {
  const supabase = createClient()
  const [parent, setParent] = useState<Parent | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [newsletterSaving, setNewsletterSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDob, setNewDob] = useState('')
  const [confirmingAdd, setConfirmingAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: parentData } = await supabase.from('parents').select('*').eq('auth_user_id', user.id).single()
    if (!parentData) return
    setParent(parentData)
    const { data: studs } = await supabase.from('students').select('id, full_name, date_of_birth, added_by_parent').eq('parent_id', parentData.id).eq('is_active', true).order('sort_order')
    setStudents(studs || [])
    setLoading(false)
  }

  async function toggleNewsletter() {
    if (!parent) return
    setNewsletterSaving(true)
    const newVal = !parent.newsletter_subscribed
    await supabase.from('parents').update({ newsletter_subscribed: newVal }).eq('id', parent.id)
    setParent(prev => prev ? { ...prev, newsletter_subscribed: newVal } : prev)
    setNewsletterSaving(false)
  }

  const MAX_STUDENTS = 3

  async function submitAddStudent() {
    if (!parent || !newName.trim()) return
    setAdding(true)
    setAddError(null)
    const { error } = await supabase.from('students').insert({
      parent_id: parent.id,
      full_name: newName.trim(),
      date_of_birth: newDob || null,
      current_level: null,
      is_active: true,
      added_by_parent: true,
      sort_order: students.length + 1,
    })
    if (error) {
      setAddError('Failed to add swimmer: ' + error.message)
      setAdding(false)
      setConfirmingAdd(false)
      return
    }
    await supabase.from('parents').update({ last_activity_at: new Date().toISOString() }).eq('id', parent.id)
    setNewName('')
    setNewDob('')
    setShowAddForm(false)
    setConfirmingAdd(false)
    setAdding(false)
    await fetchAll()
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0d1529', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)' }}>載入中...</div>
    </div>
  )

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: '#0d1529', minHeight: '100vh' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: 'clamp(32px,5vw,64px) clamp(20px,5vw,40px)' }}>

        <div style={{ marginBottom: '36px' }}>
          <Link href="/dashboard" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
            ← 返回 Dashboard
          </Link>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(24px,4vw,32px)', fontWeight: 900, color: '#fff', margin: '0 0 6px' }}>我的帳戶</h1>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>管理您的個人資料、密碼與通知設定</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* 基本資料 */}
          <div style={{ background: DARK, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>基本資料</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
              {[
                { label: '姓名', value: `${parent?.first_name} ${parent?.last_name}` },
                { label: 'Email', value: parent?.email },
                { label: '電話', value: parent?.phone || '—' },
                { label: '加入日期', value: parent?.registered_at ? new Date(parent.registered_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '—' },
              ].map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', marginBottom: '4px', letterSpacing: '1px', textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 電子報訂閱 */}
          <div style={{ background: DARK, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '4px' }}>電子報訂閱</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>接收課程優惠與最新消息</div>
            </div>
            <button
              onClick={toggleNewsletter}
              disabled={newsletterSaving}
              style={{
                width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                background: parent?.newsletter_subscribed ? '#4caf72' : 'rgba(255,255,255,0.15)',
                position: 'relative', transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: '3px',
                left: parent?.newsletter_subscribed ? '23px' : '3px',
                width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>

          {/* Students (read-only, add-only) */}
          <div style={{ background: DARK, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>Students</div>
            {students.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                {students.map(s => (
                  <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>{s.full_name}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'No birthday on file'}
                      </div>
                      {s.added_by_parent && (
                        <div style={{ fontSize: '11px', color: GOLD, marginTop: '2px' }}>Added by you</div>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>Read-only</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginBottom: '14px' }}>To change existing swimmer info, please contact the swim school.</div>

            {!showAddForm || students.length >= MAX_STUDENTS ? (
              <button
                onClick={() => setShowAddForm(true)}
                disabled={students.length >= MAX_STUDENTS}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', border: `1px solid ${GOLD}`, background: 'transparent', color: GOLD, fontSize: '13px', fontWeight: 700, cursor: students.length >= MAX_STUDENTS ? 'not-allowed' : 'pointer', opacity: students.length >= MAX_STUDENTS ? 0.35 : 1 }}
              >
                + Add Swimmer
              </button>
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>Full Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Swimmer's full name"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '13px', outline: 'none' }}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '4px' }}>Date of Birth</label>
                  <input
                    type="date"
                    value={newDob}
                    max={new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })}
                    onChange={e => setNewDob(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '13px', outline: 'none', colorScheme: 'dark' }}
                  />
                </div>
                {addError && <div style={{ fontSize: '12px', color: '#e05a4a', marginBottom: '10px' }}>{addError}</div>}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => { setShowAddForm(false); setNewName(''); setNewDob(''); setAddError(null) }}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setConfirmingAdd(true)}
                    disabled={!newName.trim()}
                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: GOLD, color: NAVY, fontSize: '13px', fontWeight: 700, cursor: newName.trim() ? 'pointer' : 'not-allowed', opacity: newName.trim() ? 1 : 0.5 }}
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

      {confirmingAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px' }}
          onClick={() => !adding && setConfirmingAdd(false)}>
          <div style={{ background: NAVY, borderRadius: '16px', width: '100%', maxWidth: '380px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
            onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Confirm New Swimmer</h2>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', margin: '0 0 20px', lineHeight: 1.5 }}>
              Add <strong style={{ color: '#fff' }}>{newName}</strong> as a new swimmer on this account?
              This cannot be undone by you afterward — please contact the swim school for any corrections.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setConfirmingAdd(false)}
                disabled={adding}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={submitAddStudent}
                disabled={adding}
                style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: GOLD, color: NAVY, fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
              >
                {adding ? 'Adding...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}
