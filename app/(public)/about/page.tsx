'use client'

import Link from 'next/link'

const NAVY = '#1a2744'
const DARK = '#111d38'
const GOLD = '#c9a84c'

const coaches = [
  {
    name: 'Shane',
    role: 'Swim Coach',
    accent: '#4a90c4',
    initials: 'SH',
    sections: [
      {
        label: 'Competitive Swim Coach',
        text: 'Horizon Swimming Team Head Coach 2018–2021 · Certified USA Swimming Coach · Certified Personal Trainer (ACE) · Private Coach (swimmer age group 10–26) 2016–',
      },
      {
        label: '15 Years Athletic Experience',
        text: 'National Swimmer representing Chinese Taipei · Former Taiwan National Record Holder 50FLY 24.48 LCH · FuJen Catholic University Men\'s Swimming Team',
      },
      {
        label: 'International Competition',
        text: 'Asian Age Group Games (Bangkok) — 50m FLY Bronze Medalist 24.91 LCH · Japan Open (Tokyo)',
      },
    ],
  },
  {
    name: 'Mitch',
    role: 'Swim Coach',
    accent: '#4caf72',
    initials: 'MT',
    sections: [
      {
        label: 'Profile',
        text: 'Former professional swimmer with 15+ years of competitive swimming experience and professional lifesaving competition experience. Patient and encouraging with students — his favorite part of coaching is helping students gain confidence with water.',
      },
      {
        label: 'Coaching Experience',
        text: 'Manta Shark Aquatics Senior Coach 2022– · Pre-team Competitive Swim Coach · Wen-Shan Civil Sports Center Invitational Coach 2018–2019 · Master\'s Swim Coach · Formosa University Teaching Assistant 2016–2019',
      },
      {
        label: 'Swim Team Representation',
        text: 'Taipei Team of Professional Lifesaving · National Formosa University Swim Team · Taipei Municipal ChengGong High School · Taipei Municipal NamMen Junior High School',
      },
    ],
  },
  {
    name: 'Mitzi',
    role: 'Swim Coach',
    accent: '#e05a4a',
    initials: 'MZ',
    sections: [
      {
        label: 'Competitive Swim Coach',
        text: 'Horizon Swimming Team Head Coach 2018–2021 · Taipei American School Varsity Team Coach · 2020 IASAS Conference Boys Team Gold Medalist, Girls Team Bronze Medalist · Private Coach (swimmer age group 10–18) 2016–',
      },
      {
        label: '15 Years Athletic Experience',
        text: 'National Swimmer Representing Chinese Taipei · National Taiwan University Women\'s Swimming · Taiwan High School Girls 100FLY Record Holder 1:00.76 LCH',
      },
      {
        label: 'International Competition',
        text: 'FINA World Championships (Rome, Dubai, Beijing, Singapore, Tokyo) · ISF International School Sport Federation Games 2010 Malta — 50 FLY Gold, 100 FLY Gold, 200 IM Silver · Asian Championships · East Asian Games (Hong Kong)',
      },
    ],
  },
]

const differentiators = [
  {
    title: 'Patient, Efficient Progression',
    text: 'We don\'t believe in "quick fixes." If a skill is vital to your child\'s safety, we take the effort to ensure they master it completely.',
    color: GOLD,
  },
  {
    title: 'No Re-Learning Required',
    text: 'We eliminate the frustration of half-built skills. While students have fun, the correct learning foundations are being repeatedly practiced.',
    color: '#4a90c4',
  },
  {
    title: 'Total Peace of Mind',
    text: 'With certified lifeguards, experienced instructors, and educational psychologists on the team, your child is in the safest hands.',
    color: '#4caf72',
  },
  {
    title: 'Holistic Student Wellbeing',
    text: 'We ensure students are healthy, learning at their own comfortable pace, and having genuine fun — turning a scary experience into a joyful routine.',
    color: '#e05a4a',
  },
]

export default function AboutPage() {
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
            Who We Are
          </div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900,
            color: '#fff', lineHeight: 1.1, marginBottom: '8px',
          }}>
            More Than Swimming.
          </h1>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 'clamp(28px,4vw,52px)', fontWeight: 900,
            color: GOLD, fontStyle: 'italic', lineHeight: 1.1, marginBottom: '24px',
          }}>
            Built for Life.
          </h1>
          <p style={{
            fontSize: 'clamp(13px,1.4vw,16px)',
            color: 'rgba(255,255,255,0.65)',
            lineHeight: 1.7, maxWidth: '560px', margin: '0 auto',
          }}>
            Professional coaching rooted in education, psychology, sports science, and child development — serious about swimming, designed for peace of mind.
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
              About Us
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(22px,2.8vw,36px)', fontWeight: 900,
              color: NAVY, lineHeight: 1.2, marginBottom: '24px',
            }}>
              Serious About Swimming.<br />Designed for Peace of Mind.
            </h2>
            <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.8, marginBottom: '16px' }}>
              At Manta Shark Aquatics, we believe swimming lessons should be more than just learning how to move through the water. They should build confidence, safety, discipline, and lifelong comfort in aquatic environments.
            </p>
            <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.8, marginBottom: '16px' }}>
              Our team combines professional swimming experience with backgrounds in education, psychology, sports science, behavioral health, and child development — from beginner swimmers to advanced athletes, we focus on structured, progression-based instruction that builds strong fundamentals correctly from day one.
            </p>
            <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.8 }}>
              Parents choose Manta Shark because they know their children are learning in a safe, supportive, and highly professional environment. We aim to make every lesson productive, encouraging, and stress-free for families.
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
                Pool Photo
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
                Swimmer Photo
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
              Our Philosophy
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(22px,2.8vw,34px)', fontWeight: 900,
              color: NAVY, lineHeight: 1.2, marginBottom: '20px',
            }}>
              Serious About Swimming,<br />Designed for Peace of Mind
            </h2>
            <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.8, marginBottom: '16px' }}>
              Having a team of professionals from unique training and backgrounds, our teaching and training philosophy is like no other. When we say we are{' '}
              <strong style={{ color: NAVY, fontWeight: 700 }}>"serious about swimming,"</strong>{' '}
              we mean that we take our craft of teaching seriously, and your child's learning experience, safety, and long-term development are our absolute priorities.
            </p>
            <p style={{ fontSize: '14px', color: '#5a6a8a', lineHeight: 1.8 }}>
              As busy professional parents, your time is valuable and your child's well-being is paramount. When you join the Manta Shark family, you can{' '}
              <strong style={{ color: NAVY, fontWeight: 700 }}>rest assured and breathe easy</strong>. We handle the technique, the safety, and the motivation, making swim day a seamless, rewarding, and stress-free part of your family's routine.
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
              The Difference
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900,
              color: '#fff', lineHeight: 1.2,
            }}>
              Proper Progression,{' '}
              <em style={{ color: GOLD, fontStyle: 'italic' }}>No Shortcuts.</em>
            </h2>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', marginTop: '12px', maxWidth: '520px', margin: '12px auto 0', lineHeight: 1.7 }}>
              What makes us different is that we focus on fundamental swim techniques from day one. Our parents stay for the long term because they value a deep, correct foundation over rushed shortcuts.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '20px',
          }}>
            {differentiators.map((item) => (
              <div key={item.title} style={{
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
                  {item.title}
                </h3>
                <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.7 }}>
                  {item.text}
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
              Meet the Team
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900,
              color: NAVY, lineHeight: 1.2, marginBottom: '12px',
            }}>
              The Manta Shark <em style={{ color: GOLD, fontStyle: 'italic' }}>Dream Team</em>
            </h2>
            <p style={{ fontSize: '14px', color: '#8a9ab8', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>
              Passionate, professional, and effective — we love seeing our students enjoy the fun of swim lessons and demonstrate improvement and progress!
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
                    {coach.role}
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
                    {coach.sections.map((sec) => (
                      <div key={sec.label}>
                        <div style={{
                          fontSize: '9px', fontWeight: 700, letterSpacing: '2px',
                          textTransform: 'uppercase', color: coach.accent,
                          marginBottom: '5px',
                        }}>
                          {sec.label}
                        </div>
                        <p style={{ fontSize: '12.5px', color: '#5a6a8a', lineHeight: 1.65 }}>
                          {sec.text}
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
            We've Got It <em style={{ color: GOLD, fontStyle: 'italic' }}>Covered.</em>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '24px' }}>
            <div style={{ width: 36, height: 2, background: 'rgba(201,168,76,0.35)', borderRadius: 1 }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD }} />
            <div style={{ width: 36, height: 2, background: 'rgba(201,168,76,0.35)', borderRadius: 1 }} />
          </div>
          <p style={{ fontSize: 'clamp(13px,1.4vw,16px)', color: 'rgba(255,255,255,0.65)', lineHeight: 1.8, marginBottom: '36px' }}>
            At Manta Shark Aquatics, we make sure all students don't just learn to swim — they master the water for life. We provide your family with a{' '}
            <strong style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>dependable, high-quality aquatic home</strong>{' '}
            for years to come.
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
            Join the Family
          </Link>
          <p style={{ marginTop: '12px', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>
            Create a free account to get started
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
