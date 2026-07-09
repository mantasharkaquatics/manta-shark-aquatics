'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

function SuccessContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessionId = searchParams.get('session_id')
  const [countdown, setCountdown] = useState(30)

  useEffect(() => {
    if (!sessionId) { router.push('/'); return }
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          router.push('/dashboard')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [sessionId])

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '480px', textAlign: 'center' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(76,175,114,0.15)', border: '2px solid rgba(76,175,114,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '36px' }}>✓</div>
        <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: '#4caf72', marginBottom: '8px' }}>付款成功</div>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '32px', fontWeight: 900, color: '#fff', margin: '0 0 12px' }}>課程已購買！</h1>
        <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, margin: '0 0 32px' }}>
          您的課程點數已自動加入帳戶，現在可以開始預約課程了。
        </p>
        <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '24px', marginBottom: '24px', textAlign: 'left' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { icon: '✅', text: '課程點數已加入帳戶' },
              { icon: '📅', text: '可立即預約課程' },
              { icon: '📧', text: '確認信已發送至您的 email' },
              { icon: '⏰', text: '點數一年內有效' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>{item.text}</span>
              </div>
            ))}
          </div>
        </div>
        <Link href="/booking" style={{ display: 'block', padding: '16px', borderRadius: '12px', background: GOLD, color: NAVY, fontSize: '14px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', textDecoration: 'none', marginBottom: '10px' }}>
          立即預約課程
        </Link>
        <Link href="/dashboard" style={{ display: 'block', padding: '14px', borderRadius: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
          返回 Dashboard
        </Link>
        <p style={{ marginTop: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.25)' }}>
          {countdown} 秒後自動跳轉到 Dashboard...
        </p>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#111d38', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>Loading...</div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
