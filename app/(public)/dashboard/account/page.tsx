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
interface Student { id: string; full_name: string; date_of_birth: string | null }

export default function AccountPage() {
  const supabase = createClient()
  const [parent, setParent] = useState<Parent | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [newsletterSaving, setNewsletterSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: parentData } = await supabase.from('parents').select('*').eq('auth_user_id', user.id).single()
    if (!parentData) return
    setParent(parentData)
    const { data: studs } = await supabase.from('students').select('id, full_name, date_of_birth').eq('parent_id', parentData.id).eq('is_active', true).order('sort_order')
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

          {/* 學生資料（唯讀） */}
          {students.length > 0 && (
            <div style={{ background: DARK, borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '12px' }}>學生資料</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {students.map(s => (
                  <div key={s.id} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '2px' }}>{s.full_name}</div>
                      <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
                        {s.date_of_birth ? new Date(s.date_of_birth).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '生日未填寫'}
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>唯讀</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '10px' }}>如需更改學生資料，請聯絡游泳學校。</div>
            </div>
          )}

        </div>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}
