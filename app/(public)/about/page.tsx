'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

const coaches = [
  { name: 'Shane', slug: 'shane', accent: '#4a90c4', initials: 'SH' },
  { name: 'Mitch', slug: 'mitch', accent: '#4caf72', initials: 'MT' },
  { name: 'Mitzi', slug: 'mitzi', accent: '#e05a4a', initials: 'MZ' },
]

const differentiators = [
  { slug: 'patient', color: GOLD },
  { slug: 'noRelearn', color: '#4a90c4' },
  { slug: 'peace', color: '#4caf72' },
  { slug: 'wellbeing', color: '#e05a4a' },
]

export default function AboutPage() {
  const t = useT()

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100vh', background: DARK }}>

      {/* ── HERO ── */}
      <div style={{
        background: NAVY,
        position: 'relative', overflow: 'hidden',
        padding: 'clamp(80px,10vw,110px) clamp(24px,5vw,72px) clamp(48px,6vw,72px)',
        textAlign: 'center',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1.5px, transparent 1.5px)',
          backgroundSize: '22px 22px',
        }} />
        {/* Deco rings */}
        {[{ side: 'left', offset: '-80px' }, { side: 'right', offset: '-80px' }].map((pos, i) => (
          <div key={i} style={{
            position: 'absolute',
            [pos.side]: pos.offset,
            top: '50%', transform: 'translateY(-50%)',
            width: '320px', height: '320px', pointerEvents: 'none',
          }}>
            {[0, 60, 120].map((inset, j) => (
              <span key={j} style={{
                position: 'absolute', borderRadius: '50%',
                border: `1px solid ${j === 2 ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.06)'}`,
                inset,
              }} />
            ))}
          </div>
        ))}

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            fontSize: '10px', fontWeight: 600, letterSpacing: '3px',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)',
            marginBottom: '16px',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
            {t('about.hero.eyebrow')}
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900,
            color: '#fff', lineHeight: 1.1, marginBottom: '8px',
          }}>
            {t('about.hero.title1')}
          </h1>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900,
            color: GOLD, fontStyle: 'italic', lineHeight: 1.1, marginBottom: '24px',
          }}>
            {t('about.hero.title2')}
          </h1>
          <p style={{
            fontSize: 'clamp(13px,1.4vw,16px)',
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.7, maxWidth: '560px', margin: '0 auto',
          }}>
            {t('about.hero.subtitle')}
          </p>
        </div>
      </div>

      {/* ── ABOUT US — text left, pool image right ── */}
      <section style={{ background: '#f0f4f8' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          maxWidth: '1200px', margin: '0 auto',
        }}>
          {/* Text */}
          <div style={{ padding: 'clamp(48px,6vw,80px) clamp(32px,5vw,64px)' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontSize: '10px', fontWeight: 600, letterSpacing: '3px',
              textTransform: 'uppercase', color: GOLD, marginBottom: '16px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
              {t('about.us.eyebrow')}
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(22px,2.8vw,36px)', fontWeight: 900,
              color: NAVY, lineHeight: 1.2, marginBottom: '24px',
            }}>
              {t('about.us.title1')}<br />{t('about.us.title2')}
            </h2>
            <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.8, marginBottom: '16px' }}>
              {t('about.us.p1')}
            </p>
            <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.8, marginBottom: '16px' }}>
              {t('about.us.p2')}
            </p>
            <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.8 }}>
              {t('about.us.p3')}
            </p>
          </div>

          {/* Image placeholder — replace with <Image> when you have a photo */}
          <div style={{
            background: `linear-gradient(135deg, #1a4a8a 0%, #0d2d5e 50%, #1a3a6a 100%)`,
            minHeight: '400px',
            position: 'relative', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }} />
            <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏊</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                {t('about.photo.pool')}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PHILOSOPHY — image left, text right ── */}
      <section style={{ background: '#f0f4f8' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          maxWidth: '1200px', margin: '0 auto',
        }}>
          {/* Image placeholder */}
          <div style={{
            background: `linear-gradient(135deg, #0a3060 0%, #1a5080 50%, #0d4070 100%)`,
            minHeight: '420px',
            position: 'relative', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            order: 0,
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }} />
            <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🌊</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase' }}>
                {t('about.photo.swimmer')}
              </div>
            </div>
          </div>

          {/* Text */}
          <div style={{ padding: 'clamp(48px,6vw,80px) clamp(32px,5vw,64px)', order: 1 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontSize: '10px', fontWeight: 600, letterSpacing: '3px',
              textTransform: 'uppercase', color: GOLD, marginBottom: '16px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
              {t('about.phil.eyebrow')}
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(22px,2.8vw,34px)', fontWeight: 900,
              color: NAVY, lineHeight: 1.2, marginBottom: '20px',
            }}>
              {t('about.phil.title1')}<br />{t('about.phil.title2')}
            </h2>
            <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.8, marginBottom: '16px' }}>
              {t('about.phil.p1a')}
              <strong style={{ color: NAVY, fontWeight: 700 }}>{t('about.phil.p1strong')}</strong>
              {t('about.phil.p1b')}
            </p>
            <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.8 }}>
              {t('about.phil.p2a')}
              <strong style={{ color: NAVY, fontWeight: 700 }}>{t('about.phil.p2strong')}</strong>
              {t('about.phil.p2b')}
            </p>
          </div>
        </div>
      </section>

      {/* ── THE DIFFERENCE ── */}
      <section style={{ background: DARK, padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontSize: '10px', fontWeight: 600, letterSpacing: '3px',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)', marginBottom: '12px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
              {t('about.diff.eyebrow')}
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900,
              color: '#fff', lineHeight: 1.2,
            }}>
              {t('about.diff.title1')}{' '}
              <em style={{ color: GOLD, fontStyle: 'italic' }}>{t('about.diff.title2')}</em>
            </h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', marginTop: '12px', maxWidth: '520px', margin: '12px auto 0', lineHeight: 1.7 }}>
              {t('about.diff.subtitle')}
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
          }}>
            {differentiators.map((item) => (
              <div key={item.slug} style={{
                background: NAVY,
                borderRadius: '16px',
                padding: '28px 24px',
                border: '1px solid rgba(255,255,255,0.07)',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  width: '100%', height: '3px',
                  background: item.color,
                  borderRadius: '16px 16px 0 0',
                }} />
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  background: `${item.color}20`,
                  border: `1px solid ${item.color}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: '16px',
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color }} />
                </div>
                <h3 style={{
                  fontSize: '15px', fontWeight: 700,
                  color: '#fff', marginBottom: '10px', lineHeight: 1.3,
                }}>
                  {t('about.diff.' + item.slug + '.title')}
                </h3>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
                  {t('about.diff.' + item.slug + '.text')}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MEET THE TEAM ── */}
      <section style={{ background: '#f0f4f8', padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              fontSize: '10px', fontWeight: 600, letterSpacing: '3px',
              textTransform: 'uppercase', color: '#8a9ab8', marginBottom: '12px',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, display: 'inline-block' }} />
              {t('about.team.eyebrow')}
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900,
              color: NAVY, lineHeight: 1.2, marginBottom: '12px',
            }}>
              {t('about.team.title1')} <em style={{ color: GOLD, fontStyle: 'italic' }}>{t('about.team.title2')}</em>
            </h2>
            <p style={{ fontSize: '14px', color: '#8a9ab8', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>
              {t('about.team.subtitle')}
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
          }}>
            {coaches.map((coach) => (
              <div key={coach.name} style={{
                background: '#fff',
                borderRadius: '20px',
                overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(26,52,128,0.08)',
                border: '1px solid #eef1f7',
              }}>
                {/* Photo area */}
                <div style={{
                  height: '200px',
                  background: `linear-gradient(135deg, ${coach.accent}33 0%, ${coach.accent}11 100%)`,
                  position: 'relative',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderBottom: `3px solid ${coach.accent}`,
                }}>
                  <div style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: coach.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '28px', fontWeight: 900, color: '#fff',
                    boxShadow: `0 4px 20px ${coach.accent}50`,
                  }}>
                    {coach.initials}
                  </div>
                  <div style={{
                    position: 'absolute', bottom: '12px', right: '16px',
                    fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px',
                    textTransform: 'uppercase', color: coach.accent,
                    background: `${coach.accent}15`,
                    border: `1px solid ${coach.accent}30`,
                    borderRadius: '20px', padding: '3px 10px',
                  }}>
                    {t('about.coach.role')}
                  </div>
                </div>

                {/* Content */}
                <div style={{ padding: '24px 24px 28px' }}>
                  <h3 style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '24px', fontWeight: 900,
                    color: NAVY, marginBottom: '20px',
                  }}>
                    {coach.name}
                  </h3>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i}>
                        <div style={{
                          fontSize: '9px', fontWeight: 700, letterSpacing: '2px',
                          textTransform: 'uppercase', color: coach.accent,
                          marginBottom: '5px',
                        }}>
                          {t('about.coach.' + coach.slug + '.s' + i + '.label')}
                        </div>
                        <p style={{ fontSize: '12.5px', color: '#5a6a8a', lineHeight: 1.65 }}>
                          {t('about.coach.' + coach.slug + '.s' + i + '.text')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        background: NAVY,
        padding: 'clamp(48px,6vw,80px) clamp(24px,5vw,72px)',
        textAlign: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1.5px, transparent 1.5px)',
          backgroundSize: '22px 22px',
        }} />
        <div style={{ position: 'relative', zIndex: 1, maxWidth: '640px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(26px,3.5vw,44px)', fontWeight: 900,
            color: '#fff', lineHeight: 1.15, marginBottom: '20px',
          }}>
            {t('about.cta.title1')} <em style={{ color: GOLD, fontStyle: 'italic' }}>{t('about.cta.title2')}</em>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '24px' }}>
            <div style={{ width: 36, height: 2, background: 'rgba(201,168,76,0.35)', borderRadius: 1 }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD }} />
            <div style={{ width: 36, height: 2, background: 'rgba(201,168,76,0.35)', borderRadius: 1 }} />
          </div>
          <p style={{ fontSize: 'clamp(13px,1.4vw,16px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.8, marginBottom: '36px' }}>
            {t('about.cta.p1')}
            <strong style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{t('about.cta.pStrong')}</strong>
            {t('about.cta.p2')}
          </p>
          <Link
            href="/register"
            style={{
              display: 'inline-block',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px', fontWeight: 700, letterSpacing: '2px',
              textTransform: 'uppercase',
              color: NAVY, background: GOLD,
              border: `2px solid ${GOLD}`,
              padding: '15px 48px', borderRadius: '6px',
              textDecoration: 'none',
              boxShadow: '0 4px 24px rgba(200,160,32,0.28)',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.background = 'transparent'
              el.style.color = GOLD
              el.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.background = GOLD
              el.style.color = NAVY
              el.style.transform = 'translateY(0)'
            }}
          >
            {t('about.cta.button')}
          </Link>
          <p style={{ marginTop: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
            {t('about.cta.note')}
          </p>
        </div>
      </section>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@400;500;600;700&display=swap');
        @media (max-width: 768px) {
          .philosophy-image { order: 1 !important; }
          .philosophy-text { order: 0 !important; }
        }
      `}</style>
    </div>
  )
}
