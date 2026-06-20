'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

const PLANS: Record<string, { name: string; sessions: number; total: number; perSession: number; courseSlug: string; badge?: string }> = {
  '1on1-10':  { name: '1-on-1 Private',      sessions: 10, total: 650,  perSession: 65,    courseSlug: '1on1' },
  '1on1-20':  { name: '1-on-1 Private',      sessions: 20, total: 1260, perSession: 63,    courseSlug: '1on1' },
  '1on1-30':  { name: '1-on-1 Private',      sessions: 30, total: 1850, perSession: 61.67, courseSlug: '1on1', badge: 'Most Popular' },
  '1on1-50':  { name: '1-on-1 Private',      sessions: 50, total: 3000, perSession: 60,    courseSlug: '1on1', badge: 'Best Value' },
  '1on2-10':  { name: '1-on-2 Semi-Private', sessions: 10, total: 1050, perSession: 105,   courseSlug: '1on2' },
  '1on2-20':  { name: '1-on-2 Semi-Private', sessions: 20, total: 2000, perSession: 100,   courseSlug: '1on2' },
  '1on2-30':  { name: '1-on-2 Semi-Private', sessions: 30, total: 2850, perSession: 95,    courseSlug: '1on2', badge: 'Most Popular' },
  '1on2-50':  { name: '1-on-2 Semi-Private', sessions: 50, total: 4500, perSession: 90,    courseSlug: '1on2', badge: 'Best Value' },
  '1on4-4':   { name: '1-on-4 Group',        sessions: 4,  total: 160,  perSession: 40,    courseSlug: '1on4' },
  '1on4-8':   { name: '1-on-4 Group',        sessions: 8,  total: 300,  perSession: 37.5,  courseSlug: '1on4' },
  'team':     { name: 'Swim Team',            sessions: 8,  total: 180,  perSession: 22.5,  courseSlug: 'team' },
}

function CheckoutContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const planId = searchParams.get('plan') || ''
  const plan = PLANS[planId]

  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [parentName, setParentName] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/login?redirect=/checkout?plan=${planId}`); return }
      const { data: parent } = await supabase
        .from('parents').select('first_name, last_name').eq('auth_user_id', user.id).single()
      if (!parent) { router.push('/login'); return }
      setParentName(`${parent.first_name} ${parent.last_name}`)
      setLoading(false)
    }
    load()
  }, [])

  async function handleCheckout() {
    setPaying(true)
    setError('')
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId }),
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      setError(data.error || '付款失敗，請再試一次')
      setPaying(false)
    }
  }

  if (!plan) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
        <p style={{ fontSize: '18px', marginBottom: '16px' }}>找不到方案</p>
        <button onClick={() => router.push('/plans')}
          style={{ padding: '10px 24px', background: GOLD, color: NAVY, border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
          返回方案頁面
        </button>
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>載入中...</div>
    </div>
  )

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '8px' }}>確認購買</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 900, color: '#fff', margin: 0 }}>購買課程包</h1>
        </div>

        {/* Plan Summary */}
        <div style={{ background: NAVY, borderRadius: '16px', border: `1px solid ${GOLD}40`, padding: '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              {plan.badge && (
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', background: GOLD, color: NAVY, borderRadius: '20px', padding: '3px 10px', display: 'inline-block', marginBottom: '8px' }}>
                  {plan.badge}
                </span>
              )}
              <p style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{plan.name}</p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                {plan.sessions} 堂課 · ${plan.perSession % 1 === 0 ? plan.perSession : plan.perSession.toFixed(2)}/堂
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '32px', fontWeight: 900, color: GOLD, margin: 0, lineHeight: 1 }}>
                ${plan.total.toLocaleString()}
              </p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', margin: '4px 0 0' }}>一次付清</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '16px', paddingTop: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', flexWrap: 'wrap' }}>
              <span>✓ 付款後立即生效</span>
              <span>✓ 一年內有效</span>
              <span>✓ 全家共用</span>
              <span>✓ 可彈性預約</span>
            </div>
          </div>
        </div>

        {/* Account Info */}
        <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px 24px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: `${GOLD}20`, border: `1px solid ${GOLD}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, color: GOLD, flexShrink: 0 }}>
            {parentName.charAt(0)}
          </div>
          <div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#fff', margin: '0 0 2px' }}>{parentName}</p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>課程包將套用到此帳戶，全部學生皆可使用</p>
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#e05a4a' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={paying}
          style={{
            width: '100%', padding: '16px', borderRadius: '12px', border: 'none',
            background: paying ? 'rgba(201,168,76,0.4)' : GOLD,
            color: NAVY, fontSize: '15px', fontWeight: 700,
            letterSpacing: '1px', textTransform: 'uppercase',
            cursor: paying ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s', marginBottom: '12px',
          }}
        >
          {paying ? '跳轉到付款頁面...' : `前往付款 · $${plan.total.toLocaleString()}`}
        </button>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.25)', margin: '0 0 12px' }}>
          🔒 由 Stripe 安全處理付款 · 支援信用卡
        </p>

        <button
          onClick={() => router.push('/plans')}
          style={{ display: 'block', width: '100%', padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer' }}
        >
          ← 返回方案頁面
        </button>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#111d38', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>載入中...</div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
