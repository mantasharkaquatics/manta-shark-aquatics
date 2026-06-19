'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { createClient } from '@/lib/supabase/client'

const PRIVATE_PACKAGES = [
  { id: '1on1-10', sessions: 10, total: 650,  perSession: 65,    savings: null, badge: null },
  { id: '1on1-20', sessions: 20, total: 1260, perSession: 63,    savings: 40,   badge: null },
  { id: '1on1-30', sessions: 30, total: 1850, perSession: 61.67, savings: 100,  badge: 'Most Popular' },
  { id: '1on1-50', sessions: 50, total: 3000, perSession: 60,    savings: 250,  badge: 'Best Value' },
]

const SEMI_PACKAGES = [
  { id: '1on2-10', sessions: 10, total: 1050, perSession: 105, savings: null, badge: null },
  { id: '1on2-20', sessions: 20, total: 2000, perSession: 100, savings: 100,  badge: null },
  { id: '1on2-30', sessions: 30, total: 2850, perSession: 95,  savings: 300,  badge: 'Most Popular' },
  { id: '1on2-50', sessions: 50, total: 4500, perSession: 90,  savings: 500,  badge: 'Best Value' },
]

const GROUP_OPTIONS = [
  { sessions: 4, price: 160, perSession: 40 },
  { sessions: 8, price: 300, perSession: 37.5 },
]

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'
const GOLD_BORDER = 'rgba(201,168,76,0.3)'

function SectionEyebrow({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px',
      fontSize: '10px', fontWeight: 600, letterSpacing: '3px',
      textTransform: 'uppercase' as const,
      color: dark ? '#8a9ab8' : 'rgba(255,255,255,0.5)',
      marginBottom: '10px',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
      {children}
    </div>
  )
}

function Divider({ center = false }: { center?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start', gap: '10px', margin: '14px 0' }}>
      <div style={{ width: 36, height: 2, background: GOLD_BORDER, borderRadius: 1 }} />
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD }} />
      {center && <div style={{ width: 36, height: 2, background: GOLD_BORDER, borderRadius: 1 }} />}
    </div>
  )
}

function GetStartedButton({ accentColor, isFeatured, label = 'Get Started', planId = '' }: {
  accentColor: string
  isFeatured: boolean
  label?: string
  planId?: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      router.push(`/checkout?plan=${planId}`)
    } else {
      router.push(`/login?redirect=/checkout?plan=${planId}`)
    }
    setLoading(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        display: 'block', width: '100%', textAlign: 'center',
        padding: '11px 0', borderRadius: '8px',
        fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px',
        textTransform: 'uppercase' as const, cursor: 'pointer',
        background: isFeatured ? accentColor : 'transparent',
        color: isFeatured ? (accentColor === GOLD ? NAVY : '#fff') : accentColor,
        border: `2px solid ${accentColor}`,
        transition: 'opacity 0.15s',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {loading ? '...' : label}
    </button>
  )
}

function PackageCard({ pkg, accentColor }: { pkg: typeof PRIVATE_PACKAGES[0]; accentColor: string }) {
  const isFeatured = !!pkg.badge
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: isFeatured ? NAVY : '#fff',
        border: `2px solid ${isFeatured ? accentColor : hovered ? accentColor : '#e5e9f0'}`,
        borderRadius: '16px', padding: '28px 24px',
        display: 'flex', flexDirection: 'column', gap: '6px',
        transition: 'border-color 0.2s, transform 0.15s, box-shadow 0.2s',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered
          ? `0 8px 32px rgba(0,0,0,${isFeatured ? '0.3' : '0.12'})`
          : isFeatured ? '0 4px 20px rgba(0,0,0,0.2)' : '0 2px 8px rgba(26,52,128,0.06)',
      }}
    >
      {pkg.badge && (
        <div style={{
          position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
          background: accentColor, color: '#fff',
          fontSize: '10px', fontWeight: 700, letterSpacing: '1.5px',
          textTransform: 'uppercase', padding: '4px 14px', borderRadius: '20px', whiteSpace: 'nowrap',
        }}>
          {pkg.badge}
        </div>
      )}
      <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: isFeatured ? 'rgba(255,255,255,0.5)' : '#8a9ab8' }}>
        {pkg.sessions} Sessions
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', margin: '8px 0 4px' }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '36px', fontWeight: 900, color: isFeatured ? accentColor : NAVY, lineHeight: 1 }}>
          ${pkg.total.toLocaleString()}
        </span>
        <span style={{ fontSize: '12px', color: isFeatured ? 'rgba(255,255,255,0.4)' : '#8a9ab8' }}>total</span>
      </div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: isFeatured ? 'rgba(255,255,255,0.7)' : '#5a6a8a' }}>
        ${pkg.perSession % 1 === 0 ? pkg.perSession : pkg.perSession.toFixed(2)} per session
      </div>
      {pkg.savings ? (
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: isFeatured ? 'rgba(201,168,76,0.15)' : 'rgba(76,175,114,0.1)',
          border: `1px solid ${isFeatured ? 'rgba(201,168,76,0.3)' : 'rgba(76,175,114,0.25)'}`,
          borderRadius: '20px', padding: '3px 10px',
          fontSize: '11px', fontWeight: 600,
          color: isFeatured ? GOLD : '#3a9a5c',
          marginTop: '6px', width: 'fit-content',
        }}>
          Save ${pkg.savings}
        </div>
      ) : <div style={{ height: '26px', marginTop: '6px' }} />}
      <div style={{ borderTop: `1px solid ${isFeatured ? 'rgba(255,255,255,0.1)' : '#eef1f7'}`, margin: '12px 0' }} />
      <GetStartedButton accentColor={accentColor} isFeatured={isFeatured} planId={pkg.id} />
    </div>
  )
}

export default function PlansPage() {
  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100vh' }}>
      <Navbar />
      <div style={{ background: DARK }}>

      {/* HERO */}
      <div style={{ background: NAVY, position: 'relative', overflow: 'hidden', padding: 'clamp(80px,10vw,100px) clamp(24px,5vw,72px) clamp(40px,5vw,60px)' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1.5px, transparent 1.5px)', backgroundSize: '22px 22px' }} />
        <div style={{ position: 'absolute', right: '-60px', top: '50%', transform: 'translateY(-50%)', width: 380, height: 380, pointerEvents: 'none' }}>
          {[0, 60, 130].map((inset, i) => (
            <span key={i} style={{ position: 'absolute', borderRadius: '50%', border: `1px solid ${i === 2 ? 'rgba(201,168,76,0.13)' : 'rgba(255,255,255,0.07)'}`, inset }} />
          ))}
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <SectionEyebrow>Pricing & Plans</SectionEyebrow>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(24px,3.2vw,40px)', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.5px', marginBottom: '12px' }}>
            Find the Right Plan<br /><em style={{ color: GOLD, fontStyle: 'italic' }}>for Your Child.</em>
          </h1>
          <Divider />
          <p style={{ fontSize: 'clamp(13px,1.3vw,15px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: '520px', marginBottom: '20px' }}>
            Every swimmer is different. Choose the format that fits your schedule, goals, and budget — all with the same expert coaching.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {[
              { label: '1-on-1 Private', dot: GOLD },
              { label: '1-on-2 Semi-Private', dot: '#4a90c4' },
              { label: '1-on-4 Group', dot: '#4caf72' },
              { label: 'Swim Team', dot: '#e05a4a' },
            ].map((chip) => (
              <span key={chip.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '30px', padding: '6px 14px', fontSize: '11px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.82)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: chip.dot, display: 'inline-block' }} />
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 1-ON-1 */}
      <section style={{ padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SectionEyebrow>Private Lessons</SectionEyebrow>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,2.5vw,32px)', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>1-on-1 Private</h2>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', marginBottom: '8px' }}>30 minutes · $65 per session · Full coach attention</p>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, maxWidth: '560px', marginBottom: '36px' }}>
            Dedicated one-on-one time with a coach. Fastest way to build technique and confidence, tailored entirely to your child's pace.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {PRIVATE_PACKAGES.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} accentColor={GOLD} />)}
          </div>
        </div>
      </section>

      <div style={{ background: '#f0f4f8', position: 'relative' }}>
        <svg viewBox="0 0 1440 40" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ display: 'block', width: '100%', marginTop: '-1px' }}>
          <path d="M0,20 C480,40 960,0 1440,20 L1440,0 L0,0 Z" fill={DARK} />
        </svg>
      </div>

      {/* 1-ON-2 */}
      <section style={{ background: '#f0f4f8', padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SectionEyebrow dark>Semi-Private Lessons</SectionEyebrow>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(22px,2.5vw,32px)', fontWeight: 900, color: NAVY, marginBottom: '6px' }}>1-on-2 Semi-Private</h2>
          <p style={{ fontSize: '14px', color: '#8a9ab8', marginBottom: '8px' }}>30 minutes · $110 per session · Parents find their own partner</p>
          <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.7, maxWidth: '560px', marginBottom: '36px' }}>
            Share a lesson with one other swimmer. Great value when paired with a sibling or friend — same focused coaching, split across two students.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {SEMI_PACKAGES.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} accentColor="#4a90c4" />)}
          </div>
        </div>
      </section>

      <div style={{ background: DARK, position: 'relative' }}>
        <svg viewBox="0 0 1440 40" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ display: 'block', width: '100%', marginTop: '-1px' }}>
          <path d="M0,20 C480,0 960,40 1440,20 L1440,0 L0,0 Z" fill="#f0f4f8" />
        </svg>
      </div>

      {/* GROUP + SWIM TEAM */}
      <section style={{ background: DARK, padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '28px' }}>
            <div style={{ background: NAVY, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', padding: '36px 32px' }}>
              <SectionEyebrow>Group Lessons</SectionEyebrow>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(20px,2.2vw,28px)', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>1-on-4 Group</h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>30 minutes · Max 4 students per coach</p>
              <p style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, marginBottom: '28px' }}>
                Structured group classes with up to 4 students. Book online and see real-time availability.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                {GROUP_OPTIONS.map((opt) => (
                  <div key={opt.sessions} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px 20px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '2px' }}>{opt.sessions} sessions / month</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>${opt.perSession}/session</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 900, color: '#4caf72', lineHeight: 1 }}>${opt.price}</div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>per month</div>
                    </div>
                  </div>
                ))}
              </div>
              <GetStartedButton accentColor="#4caf72" isFeatured={true} label="Enroll Now" planId="1on4-4" />
            </div>

            <div style={{ background: NAVY, borderRadius: '20px', border: '1px solid rgba(255,255,255,0.08)', padding: '36px 32px' }}>
              <SectionEyebrow>Competitive</SectionEyebrow>
              <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(20px,2.2vw,28px)', fontWeight: 900, color: '#fff', marginBottom: '6px' }}>Swim Team</h2>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>90 minutes · Mon & Wed 6:00–7:30 PM · Max 24 swimmers</p>
              <p style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, marginBottom: '28px' }}>
                Competitive swim training for dedicated swimmers. Focus on stroke technique, endurance, turns, and race strategy.
              </p>
              <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '40px', fontWeight: 900, color: '#e05a4a', lineHeight: 1 }}>$180</span>
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>/ month</span>
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>Mon & Wed · 6:00–7:30 PM<br />Maximum 24 swimmers</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '28px' }}>
                {['Stroke technique & drills', 'Endurance training sets', 'Flip turns & race starts', 'Race strategy coaching'].map((feat) => (
                  <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#e05a4a', flexShrink: 0, display: 'inline-block' }} />
                    {feat}
                  </div>
                ))}
              </div>
              <GetStartedButton accentColor="#e05a4a" isFeatured={true} label="Join the Team" planId="team" />
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON NOTE */}
      <section style={{ background: DARK, padding: '0 clamp(24px,5vw,72px) clamp(48px,6vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', background: NAVY, borderRadius: '16px', border: `1px solid ${GOLD_BORDER}`, padding: 'clamp(24px,3vw,36px) clamp(24px,4vw,48px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '24px', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '6px' }}>Not sure which?</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(18px,2vw,24px)', fontWeight: 900, color: '#fff', lineHeight: 1.2 }}>
              We'll help you<br /><em style={{ color: GOLD }}>find the right fit.</em>
            </div>
          </div>
          {[
            { label: 'Fastest progress', value: '1-on-1 Private' },
            { label: 'Best value with a friend', value: '1-on-2 Semi-Private' },
            { label: 'Social & affordable', value: '1-on-4 Group' },
            { label: 'Competitive goals', value: 'Swim Team' },
          ].map((item) => (
            <div key={item.label} style={{ borderLeft: `2px solid ${GOLD_BORDER}`, paddingLeft: '16px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: '4px' }}>{item.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: NAVY, padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1.5px, transparent 1.5px)', backgroundSize: '22px 22px' }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '600px', margin: '0 auto' }}>
          <SectionEyebrow>Get Started</SectionEyebrow>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(24px,3vw,36px)', fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: '16px' }}>Ready to dive in?</h2>
          <Divider center />
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: '32px' }}>
            Create your free account and book your first lesson today. No commitment required to get started.
          </p>
          <GetStartedButton accentColor={GOLD} isFeatured={true} label="Create Free Account" planId="" />
        </div>
      </section>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      </div>
    </div>
  )
}
