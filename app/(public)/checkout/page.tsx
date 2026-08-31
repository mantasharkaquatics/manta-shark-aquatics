'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'
import Link from 'next/link'
import { TRIAL_PRICE_CENTS } from '@/lib/plans'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

const PLANS: Record<string, { name: string; slug: string; sessions: number; total: number; perSession: number; courseSlug: string; badge?: string; validityMonths: number }> = {
  '1on1-10':  { name: '1-on-1 Private',      sessions: 10, total: 650,  perSession: 65,    courseSlug: '1on1', slug: 'private', validityMonths: 4 },
  '1on1-20':  { name: '1-on-1 Private',      sessions: 20, total: 1260, perSession: 63,    courseSlug: '1on1', slug: 'private', validityMonths: 8 },
  '1on1-30':  { name: '1-on-1 Private',      sessions: 30, total: 1850, perSession: 61.67, courseSlug: '1on1', slug: 'private', badge: 'popular', validityMonths: 12 },
  '1on1-50':  { name: '1-on-1 Private',      sessions: 50, total: 3000, perSession: 60,    courseSlug: '1on1', slug: 'private', badge: 'best', validityMonths: 18 },
  '1on2-10':  { name: '1-on-2 Semi-Private', sessions: 10, total: 1050, perSession: 105,   courseSlug: '1on2', slug: 'semi', validityMonths: 4 },
  '1on2-20':  { name: '1-on-2 Semi-Private', sessions: 20, total: 2000, perSession: 100,   courseSlug: '1on2', slug: 'semi', validityMonths: 8 },
  '1on2-30':  { name: '1-on-2 Semi-Private', sessions: 30, total: 2850, perSession: 95,    courseSlug: '1on2', slug: 'semi', badge: 'popular', validityMonths: 12 },
  '1on2-50':  { name: '1-on-2 Semi-Private', sessions: 50, total: 4500, perSession: 90,    courseSlug: '1on2', slug: 'semi', badge: 'best', validityMonths: 18 },
  '1on4-10':  { name: '1-on-4 Group',        sessions: 10, total: 400,  perSession: 40,    courseSlug: '1on4', slug: 'group', validityMonths: 4 },
  '1on4-20':  { name: '1-on-4 Group',        sessions: 20, total: 760,  perSession: 38,    courseSlug: '1on4', slug: 'group', validityMonths: 8 },
}

function CheckoutContent() {
  const t = useT()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()

  const planId = searchParams.get('plan') || ''
  const plan = PLANS[planId]
  const isTeam = planId === 'team'

  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [parentName, setParentName] = useState('')
  const [students, setStudents] = useState<{ id: string; full_name: string; current_level: number | null }[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [teamPrice, setTeamPrice] = useState<{ cents: number; varies: boolean } | null>(null)

  // Swim Team already refuses an unassessed swimmer at the point of selection,
  // so this gate is for lesson packages only.
  const needsAssessment = !isTeam && students.length > 0 && students.every(st => st.current_level == null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/login?redirect=/checkout?plan=${planId}`); return }
      const { data: parent } = await supabase
        .from('parents').select('id, first_name, last_name').eq('auth_user_id', user.id).single()
      if (!parent) { router.push('/login'); return }
      setParentName(`${parent.first_name} ${parent.last_name}`)
      // Loaded for every plan now, not just Swim Team: a package purchase has
      // to know whether anyone in this family has been assessed yet.
      const { data: studs } = await supabase
        .from('students').select('id, full_name, current_level')
        .eq('parent_id', (parent as any).id).eq('is_active', true).order('sort_order')
      setStudents(studs || [])
      if (isTeam) {
        try {
          const r = await fetch('/api/team/tiers')
          const j = r.ok ? await r.json() : null
          const cents = (j?.tiers || []).map((x: any) => x.monthly_price_cents).filter(Boolean)
          if (cents.length) setTeamPrice({ cents: Math.min(...cents), varies: new Set(cents).size > 1 })
        } catch {}
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleCheckout() {
    if (isTeam && !selectedStudentId) { setError(t('checkout.err.selectStudent')); return }
    setPaying(true)
    setError('')
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planId, studentId: selectedStudentId || undefined }),
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

  if (!plan && !isTeam) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
        <p style={{ fontSize: '18px', marginBottom: '16px' }}>{t('checkout.notFound')}</p>
        <button onClick={() => router.push('/plans')}
          style={{ padding: '10px 24px', background: GOLD, color: NAVY, border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
          {t('checkout.backToPlans')}
        </button>
      </div>
    </div>
  )

  if (loading) return (
    <div style={{ minHeight: '100vh', background: DARK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>{t('checkout.loading')}</div>
    </div>
  )

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", background: DARK, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: GOLD, marginBottom: '8px' }}>{t('checkout.eyebrow')}</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '28px', fontWeight: 900, color: '#fff', margin: 0 }}>{isTeam ? t('checkout.titleTeam') : t('checkout.titlePackage')}</h1>
        </div>

        {isTeam && (
          <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(224,90,74,0.4)', padding: '24px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{t('checkout.team.name')}</p>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>{t('checkout.team.desc')}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '32px', fontWeight: 900, color: '#e05a4a', margin: 0, lineHeight: 1 }}>{teamPrice?.varies ? t('checkout.priceFrom', { price: (teamPrice ? '$' + (teamPrice.cents / 100).toLocaleString() : '') }) : (teamPrice ? '$' + (teamPrice.cents / 100).toLocaleString() : '')}</p>
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
        )}

        {/* Plan Summary */}
        {!isTeam && (
        <div style={{ background: NAVY, borderRadius: '16px', border: `1px solid ${GOLD}40`, padding: '24px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              {plan.badge && (
                <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', background: GOLD, color: NAVY, borderRadius: '20px', padding: '3px 10px', display: 'inline-block', marginBottom: '8px' }}>
                  {t('plans.badge.' + plan.badge)}
                </span>
              )}
              <p style={{ fontSize: '18px', fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>{t('plans.chip.' + plan.slug)}</p>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                {t('checkout.sessionLine', { n: plan.sessions, price: plan.perSession % 1 === 0 ? plan.perSession : plan.perSession.toFixed(2) })}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '32px', fontWeight: 900, color: GOLD, margin: 0, lineHeight: 1 }}>
                ${plan.total.toLocaleString()}
              </p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', margin: '4px 0 0' }}>{t('checkout.oneTime')}</p>
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '16px', paddingTop: '16px' }}>
            <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'rgba(255,255,255,0.5)', flexWrap: 'wrap' }}>
              <span>✓ {t('checkout.feat1')}</span>
              <span>✓ {t('checkout.feat2', { n: plan.validityMonths })}</span>
              <span>✓ {t('checkout.feat3')}</span>
              <span>✓ {t('checkout.feat4')}</span>
            </div>
          </div>
        </div>
        )}

        {/* Account Info */}
        <div style={{ background: NAVY, borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', padding: '20px 24px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: `${GOLD}20`, border: `1px solid ${GOLD}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 700, color: GOLD, flexShrink: 0 }}>
            {parentName.charAt(0)}
          </div>
          <div>
            <p style={{ fontSize: '13px', fontWeight: 600, color: '#fff', margin: '0 0 2px' }}>{parentName}</p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', margin: 0 }}>{isTeam ? t('checkout.acctTeam') : t('checkout.acctPackage')}</p>
          </div>
        </div>

        {isTeam && (
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
        )}

        {error && (
          <div style={{ background: 'rgba(224,90,74,0.1)', border: '1px solid rgba(224,90,74,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#e05a4a' }}>
            {error}
          </div>
        )}

        {needsAssessment ? (
          <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.35)', borderRadius: '12px', padding: '20px 22px', marginBottom: '12px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: GOLD, marginBottom: '8px' }}>{t('checkout.assess.title')}</div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.7, margin: '0 0 10px' }}>
              {t('checkout.assess.body', { price: '$' + (TRIAL_PRICE_CENTS / 100).toLocaleString() })}
            </p>
            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: '0 0 16px' }}>
              {t('checkout.assess.why')}
            </p>
            <Link href="/booking"
              style={{ display: 'inline-block', padding: '12px 22px', borderRadius: '10px', background: GOLD, color: NAVY, fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
              {t('checkout.assess.cta')}
            </Link>
          </div>
        ) : (
        <button
          onClick={handleCheckout}
          disabled={paying || (isTeam && !selectedStudentId)}
          style={{
            width: '100%', padding: '16px', borderRadius: '12px', border: 'none',
            background: paying ? 'rgba(201,168,76,0.4)' : GOLD,
            color: NAVY, fontSize: '15px', fontWeight: 700,
            letterSpacing: '1px', textTransform: 'uppercase',
            cursor: paying ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s', marginBottom: '12px',
          }}
        >
          {paying ? t('checkout.redirecting') : isTeam ? t('checkout.subscribe', { price: (teamPrice ? '$' + (teamPrice.cents / 100).toLocaleString() : '') }) : t('checkout.proceed', { price: '$' + plan.total.toLocaleString() })}
        </button>
        )}

        {!needsAssessment && (
          <p style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.25)', margin: '0 0 12px' }}>
            🔒 {t('checkout.stripeNote')}
          </p>
        )}

        <button
          onClick={() => router.push('/plans')}
          style={{ display: 'block', width: '100%', padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer' }}
        >
          ← {t('checkout.backToPlans')}
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
