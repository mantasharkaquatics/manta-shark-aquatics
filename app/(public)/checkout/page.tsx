'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

// Swim Team is the only thing still bought as a plan: a monthly membership per
// swimmer, billed to a card. Lessons are paid for out of the points wallet and
// are topped up on /plans, which needs no confirmation screen -- the parent
// names an amount and goes straight to Stripe. So this page, which used to
// confirm any package, now only ever confirms a team membership.

function CheckoutContent() {
  const t = useT()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const planId = searchParams.get('plan') || ''
  const isTeam = planId === 'team'

  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [parentName, setParentName] = useState('')
  const [students, setStudents] = useState<{ id: string; full_name: string; current_level: number | null }[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [teamPrice, setTeamPrice] = useState<{ cents: number; varies: boolean } | null>(null)

  // A link to an old package checkout is not an error the parent should have to
  // read about -- send them to the page that replaced it.
  useEffect(() => {
    if (!isTeam) router.replace('/plans')
  }, [isTeam])

  useEffect(() => {
    if (!isTeam) return
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?redirect=/checkout?plan=team'); return }
      const { data: parent } = await supabase
        .from('parents').select('id, first_name, last_name').eq('auth_user_id', user.id).single()
      if (!parent) { router.push('/login'); return }
      setParentName(`${parent.first_name} ${parent.last_name}`)
      const { data: studs } = await supabase
        .from('students').select('id, full_name, current_level')
        .eq('parent_id', (parent as any).id).eq('is_active', true).order('sort_order')
      setStudents(studs || [])
      try {
        const r = await fetch('/api/team/tiers')
        const j = r.ok ? await r.json() : null
        const cents = (j?.tiers || []).map((x: any) => x.monthly_price_cents).filter(Boolean)
        if (cents.length) setTeamPrice({ cents: Math.min(...cents), varies: new Set(cents).size > 1 })
      } catch {}
      setLoading(false)
    }
    load()
  }, [isTeam])

  async function handleCheckout() {
    if (!selectedStudentId) { setError(t('checkout.err.selectStudent')); return }
    setPaying(true)
    setError('')
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId: 'team', studentId: selectedStudentId }),
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      const k = errorKey(data.error)
      setError(k ? t(k) : (data.error || t('checkout.err.payment')))
      setPaying(false)
    }
  }

  if (!isTeam || loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{t('checkout.loading')}</div>
    </div>
  )

  const priceLabel = teamPrice ? '$' + (teamPrice.cents / 100).toLocaleString() : ''

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '8px' }}>{t('checkout.eyebrow')}</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 900, color: '#fff', margin: 0 }}>{t('checkout.titleTeam')}</h1>
        </div>

        <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(224,90,74,0.4)', padding: '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{t('checkout.team.name')}</p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>{t('checkout.team.desc')}</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '32px', fontWeight: 900, color: '#e05a4a', margin: 0, lineHeight: 1 }}>
                {teamPrice?.varies ? t('checkout.priceFrom', { price: priceLabel }) : priceLabel}
              </p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', margin: '4px 0 0' }}>{t('checkout.perMonth')}</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '16px', paddingTop: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', flexWrap: 'wrap' }}>
              <span>✓ {t('checkout.team.feat1')}</span>
              <span>✓ {t('checkout.team.feat2')}</span>
              <span>✓ {t('checkout.team.feat3')}</span>
            </div>
          </div>
        </div>

        <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px 24px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: `${GOLD}20`, border: `1px solid ${GOLD}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, color: GOLD, flexShrink: 0 }}>
            {parentName.charAt(0)}
          </div>
          <div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#fff', margin: '0 0 2px' }}>{parentName}</p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>{t('checkout.acctTeam')}</p>
          </div>
        </div>

        <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px 24px', marginBottom: '16px' }}>
          <p style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', margin: '0 0 12px' }}>{t('checkout.selectStudent')}</p>
          {students.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>{t('checkout.noStudents')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {students.map(st => {
                const eligible = (st.current_level || 0) >= 4
                const sel = selectedStudentId === st.id
                return (
                  <button key={st.id} onClick={() => eligible && setSelectedStudentId(st.id)} disabled={!eligible}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderRadius: '10px', border: sel ? `2px solid ${GOLD}` : '1px solid rgba(255,255,255,0.12)', background: sel ? 'rgba(201,168,76,0.1)' : 'transparent', color: eligible ? '#fff' : 'rgba(255,255,255,0.3)', fontSize: '14px', fontWeight: 600, cursor: eligible ? 'pointer' : 'not-allowed', textAlign: 'left' }}>
                    <span>{st.full_name}</span>
                    <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{st.current_level ? t('levels.levelN', { n: st.current_level }) : t('dash.pendingAssessment')}{!eligible ? ' · ' + t('checkout.notEligible') : ''}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#e05a4a' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleCheckout}
          disabled={paying || !selectedStudentId}
          style={{
            width: '100%', padding: '16px', borderRadius: '12px', border: 'none',
            background: paying ? 'rgba(201,168,76,0.4)' : GOLD,
            color: NAVY, fontSize: '15px', fontWeight: 700,
            letterSpacing: '1px', textTransform: 'uppercase',
            cursor: paying ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s', marginBottom: '12px',
          }}
        >
          {paying ? t('checkout.redirecting') : t('checkout.subscribe', { price: priceLabel })}
        </button>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.25)', margin: '0 0 12px' }}>
          🔒 {t('checkout.stripeNote')}
        </p>

        <button
          onClick={() => router.push('/plans')}
          style={{ display: 'block', width: '100%', padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer' }}
        >
          ← {t('checkout.backToPoints')}
        </button>
      </div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
    </div>
  )
}

export default function CheckoutPage() {
  const t = useT()
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', background: '#111d38', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{t('checkout.loading')}</div>
      </div>
    }>
      <CheckoutContent />
    </Suspense>
  )
}
