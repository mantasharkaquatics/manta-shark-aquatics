'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/provider'
import { errorKey } from '@/lib/i18n/errors'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

// Swim Team is the only thing still bought as a plan: a monthly membership per
// swimmer, billed to a card. Lessons are paid for out of the points wallet and
// are topped up on /plans, which needs no confirmation screen -- the parent
// names an amount and goes straight to Stripe. So this page, which used to
// confirm any package, now only ever confirms a team membership.
//
// Palette B (2026-09): the site's dark top, then on the pale blue what you are
// buying on the left and who it is for on the right, amber for the one button.

const css = `
  .co-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: start; max-width: 960px; }
  .co-card { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 18px; padding: 26px; }
  .co-card + .co-card { margin-top: 16px; }
  .co-label { font-size: 11px; font-weight: 800; letter-spacing: 1.8px; text-transform: uppercase; color: ${BRAND.blue}; margin: 0 0 12px; }
  .co-plan { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .co-plan h2 { font-size: 22px; font-weight: 800; color: ${BRAND.navy}; }
  .co-plan p { font-size: 14px; color: ${BRAND.mute}; line-height: 1.6; margin: 6px 0 0; }
  .co-price { text-align: right; flex-shrink: 0; }
  .co-price b { display: block; font-family: var(--font-display), serif; font-size: 34px; font-weight: 900; color: ${BRAND.navy}; line-height: 1; }
  .co-price small { font-size: 12px; color: ${BRAND.mute}; }
  .co-feats { list-style: none; margin: 20px 0 0; padding: 18px 0 0; border-top: 1px solid ${BRAND.line}; display: flex; flex-direction: column; gap: 10px; }
  .co-feats li { display: flex; gap: 10px; align-items: center; font-size: 14px; color: ${BRAND.ink}; }
  .co-feats li::before { content: '✓'; width: 22px; height: 22px; border-radius: 50%; background: #e6f4ee; color: #1f7a57; display: grid;
    place-items: center; font-size: 12px; font-weight: 800; flex-shrink: 0; }
  .co-who { display: flex; align-items: center; gap: 14px; }
  .co-who i { width: 42px; height: 42px; border-radius: 50%; background: ${BRAND.paper}; border: 1px solid ${BRAND.line}; color: ${BRAND.blue};
    display: grid; place-items: center; font-style: normal; font-weight: 800; flex-shrink: 0; }
  .co-who b { display: block; font-size: 15px; color: ${BRAND.navy}; }
  .co-who small { font-size: 13px; color: ${BRAND.mute}; }
  .co-students { display: flex; flex-direction: column; gap: 8px; }
  .co-st { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 14px; border-radius: 12px;
    border: 2px solid ${BRAND.line}; background: #fff; color: ${BRAND.ink}; font-size: 15px; font-weight: 700; cursor: pointer;
    text-align: left; font-family: inherit; }
  .co-st:hover:not(:disabled) { border-color: #bcd0ea; }
  .co-st[aria-pressed="true"] { border-color: ${BRAND.blue}; background: #eef4fc; }
  .co-st:disabled { cursor: not-allowed; color: #9aa6ba; background: ${BRAND.paper}; }
  .co-st small { font-size: 12px; font-weight: 600; color: ${BRAND.mute}; }
  .co-err { background: #fdecea; border: 1px solid #f5c2bd; border-radius: 10px; padding: 12px 16px; margin-top: 16px; font-size: 14px; color: #b3261e; }
  .co-pay { width: 100%; margin-top: 18px; }
  .co-note { text-align: center; font-size: 12.5px; color: ${BRAND.mute}; margin: 12px 0 0; }
  .co-back { display: block; width: 100%; margin-top: 12px; }
  .co-loading { min-height: 60vh; display: grid; place-items: center; color: ${BRAND.mute}; font-size: 15px; }
  @media (max-width: 860px) { .co-grid { grid-template-columns: 1fr; } .co-card { padding: 20px; } }
`

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

  const priceLabel = teamPrice ? '$' + (teamPrice.cents / 100).toLocaleString() : ''

  return (
    <BrandRoot>
      <style>{css}</style>
      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">{t('checkout.eyebrow')}</p>
          <h1>{t('checkout.titleTeam')}</h1>
          <p className="b-lead">{t('checkout.acctTeam')}</p>
        </div>
      </header>

      <section className="b-sec b-paper" style={{ paddingTop: 48 }}>
        <div className="b-wrap">
          {!isTeam || loading ? (
            <div className="co-loading">{t('checkout.loading')}</div>
          ) : (
            <div className="co-grid">
              {/* What is being bought */}
              <div className="co-card">
                <div className="co-plan">
                  <div>
                    <h2>{t('checkout.team.name')}</h2>
                    <p>{t('checkout.team.desc')}</p>
                  </div>
                  <div className="co-price">
                    <b>{teamPrice?.varies ? t('checkout.priceFrom', { price: priceLabel }) : priceLabel}</b>
                    <small>{t('checkout.perMonth')}</small>
                  </div>
                </div>
                <ul className="co-feats">
                  <li>{t('checkout.team.feat1')}</li>
                  <li>{t('checkout.team.feat2')}</li>
                  <li>{t('checkout.team.feat3')}</li>
                </ul>
              </div>

              {/* Who it is for, and pay */}
              <div>
                <div className="co-card">
                  <div className="co-who">
                    <i>{parentName.charAt(0)}</i>
                    <b>{parentName}</b>
                  </div>
                </div>

                <div className="co-card">
                  <p className="co-label">{t('checkout.selectStudent')}</p>
                  {students.length === 0 ? (
                    <p style={{ fontSize: 14, color: BRAND.mute, margin: 0 }}>{t('checkout.noStudents')}</p>
                  ) : (
                    <div className="co-students">
                      {students.map(st => {
                        // Swim Team starts at Level 4.
                        const eligible = (st.current_level || 0) >= 4
                        return (
                          <button key={st.id} type="button" className="co-st" disabled={!eligible}
                            aria-pressed={selectedStudentId === st.id}
                            onClick={() => eligible && setSelectedStudentId(st.id)}>
                            <span>{st.full_name}</span>
                            <small>
                              {st.current_level ? t('levels.levelN', { n: st.current_level }) : t('dash.pendingAssessment')}
                              {!eligible ? ' · ' + t('checkout.notEligible') : ''}
                            </small>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  {error && <div className="co-err">{error}</div>}

                  <button type="button" className="b-btn gold co-pay" onClick={handleCheckout} disabled={paying || !selectedStudentId}>
                    {paying ? t('checkout.redirecting') : t('checkout.subscribe', { price: priceLabel })}
                  </button>
                  <p className="co-note">🔒 {t('checkout.stripeNote')}</p>
                  <button type="button" className="b-btn line co-back" onClick={() => router.push('/plans')}>
                    ← {t('checkout.backToPoints')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </BrandRoot>
  )
}

export default function CheckoutPage() {
  const t = useT()
  return (
    <Suspense fallback={<div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', color: BRAND.mute }}>{t('checkout.loading')}</div>}>
      <CheckoutContent />
    </Suspense>
  )
}
