'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useT } from '@/lib/i18n/provider'

const levels = [
  { num: 1, color: '#e05a4a', goalCount: 5 },
  { num: 2, color: '#e8883a', goalCount: 8 },
  { num: 3, color: '#d4a825', goalCount: 6 },
  { num: 4, color: '#4caf72', goalCount: 6 },
  { num: 5, color: '#4a90c4', goalCount: 6 },
  { num: 6, color: '#7b5ea7', goalCount: 6 },
  { num: 7, color: '#9c7a3c', goalCount: 8 },
  { num: 8, color: '#a0a0a0', goalCount: 6 },
  { num: 9, color: '#c8a020', goalCount: 5 },
]

export default function LevelsContent() {
  const t = useT()
  const [activeLevel, setActiveLevel] = useState(0)
  const [openAccordion, setOpenAccordion] = useState<number | null>(null)

  const current = levels[activeLevel]

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", minHeight: '100vh', background: '#111d38' }}>

      {/* ── TOP BANNER ── */}
      <div
        style={{
          background: '#1a2744',
          position: 'relative',
          overflow: 'hidden',
          padding: 'clamp(80px, 10vw, 100px) clamp(24px, 5vw, 72px) clamp(28px, 4vw, 40px)',
        }}
      >
        {/* dot pattern */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.05) 1.5px, transparent 1.5px)',
            backgroundSize: '22px 22px',
          }}
        />
        {/* deco rings */}
        <div
          style={{
            position: 'absolute',
            right: '-60px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '380px',
            height: '380px',
            pointerEvents: 'none',
          }}
        >
          {[0, 50, 110].map((inset, i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                borderRadius: '50%',
                border: `1px solid ${i === 2 ? 'rgba(200,160,32,0.13)' : 'rgba(255,255,255,0.07)'}`,
                inset: `${inset}px`,
              }}
            />
          ))}
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '8px',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c9a84c', display: 'inline-block' }} />
            {t('levels.hero.eyebrow')}
          </div>

          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(22px, 3vw, 36px)',
              fontWeight: 900,
              color: '#fff',
              lineHeight: 1.1,
              letterSpacing: '-0.5px',
              marginBottom: '10px',
            }}
          >
            {t('levels.hero.title1')} <br />
            <em style={{ color: '#c9a84c', fontStyle: 'italic' }}>{t('levels.hero.title2')}</em>
          </h1>

          <p
            style={{
              fontSize: 'clamp(12px, 1.3vw, 14px)',
              color: 'rgba(255,255,255,0.65)',
              lineHeight: 1.6,
              maxWidth: '520px',
              marginBottom: '16px',
            }}
          >
            {t('levels.hero.subtitle')}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <div style={{ width: '40px', height: '2px', background: '#c9a84c', borderRadius: '1px' }} />
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)' }} />
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {[
              { slug: 'nine', dot: '#e05a4a' },
              { slug: 'progression', dot: '#4caf72' },
              { slug: 'allAges', dot: '#c9a84c' },
            ].map((chip) => (
              <span
                key={chip.slug}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  borderRadius: '30px',
                  padding: '6px 14px',
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.82)',
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: chip.dot, display: 'inline-block' }} />
                {t('levels.chip.' + chip.slug)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── DESKTOP LEVEL SELECTOR ── */}
      <div
        className="desktop-levels"
        style={{
          display: 'grid',
          gridTemplateColumns: '210px 1fr',
          background: '#f0f4f8',
          minHeight: '560px',
        }}
      >
        {/* Side Nav */}
        <nav style={{ background: '#1a2744', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {levels.map((lv, i) => (
            <button
              key={lv.num}
              onClick={() => setActiveLevel(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: 'none',
                background: activeLevel === i ? 'rgba(255,255,255,0.15)' : 'transparent',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (activeLevel !== i) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.09)'
              }}
              onMouseLeave={(e) => {
                if (activeLevel !== i) (e.currentTarget as HTMLElement).style.background = 'transparent'
              }}
            >
              <span
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                  background: lv.color,
                  border: `2px solid ${activeLevel === i ? '#fff' : 'rgba(255,255,255,0.25)'}`,
                }}
              >
                {lv.num}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                  {t('levels.levelN', { n: lv.num })}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: activeLevel === i ? '#fff' : 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>
                  {t('level.' + lv.num + '.name')}
                </span>
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '14px',
                  color: activeLevel === i ? '#c9a84c' : 'rgba(255,255,255,0.25)',
                  transform: activeLevel === i ? 'rotate(90deg)' : 'none',
                  transition: 'transform 0.2s, color 0.2s',
                }}
              >
                ›
              </span>
            </button>
          ))}
        </nav>

        {/* Panel */}
        <div style={{ padding: '32px 40px', background: '#f0f4f8', minHeight: '560px' }}>
          {/* Header */}
          <div
            style={{
              borderRadius: '16px',
              padding: '28px 36px',
              marginBottom: '28px',
              position: 'relative',
              overflow: 'hidden',
              background: current.color,
            }}
          >
            <div
              style={{
                position: 'absolute',
                right: '-30px',
                top: '-30px',
                width: '140px',
                height: '140px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)',
                pointerEvents: 'none',
              }}
            />
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: '6px' }}>
              {t('levels.levelN', { n: current.num })}
            </div>
            <div
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(24px, 2.8vw, 34px)',
                fontWeight: 900,
                color: '#fff',
              }}
            >
              {t('level.' + current.num + '.name')}
            </div>
          </div>

          {/* Body */}
          <div
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '28px 32px',
              boxShadow: '0 2px 16px rgba(26,52,128,0.07)',
            }}
          >
            <p style={{ fontSize: '15px', fontWeight: 700, color: '#1a2744', marginBottom: '10px', lineHeight: 1.5 }}>
              {t('levels.' + current.num + '.tagline')}
            </p>
            <p
              style={{
                fontSize: '13.5px',
                color: '#5a6a8a',
                lineHeight: 1.8,
                marginBottom: '22px',
                paddingBottom: '20px',
                borderBottom: '1px solid rgba(0,0,0,0.07)',
              }}
            >
              {t('levels.' + current.num + '.desc')}
            </p>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#1a2744', marginBottom: '14px' }}>
              {t('levels.goalsHeading')}
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '11px', padding: 0, margin: 0 }}>
              {Array.from({ length: current.goalCount }, (_, gi) => gi + 1).map((g, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '11px', fontSize: '13.5px', color: '#3a4a6a', lineHeight: 1.65 }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      background: current.color,
                      marginTop: '7px',
                      display: 'inline-block',
                    }}
                  />
                  {t('levels.' + current.num + '.goal.' + g)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── MOBILE ACCORDION ── */}
      <div
        className="mobile-levels"
        style={{
          display: 'none',
          padding: '12px',
          flexDirection: 'column',
          gap: '6px',
          background: '#f0f4f8',
        }}
      >
        {levels.map((lv, i) => (
          <div
            key={lv.num}
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
            }}
          >
            <button
              onClick={() => setOpenAccordion(openAccordion === i ? null : i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
              }}
            >
              <span
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                  background: lv.color,
                }}
              >
                {lv.num}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: '#aaa' }}>{t('levels.levelN', { n: lv.num })}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#2a3a5c' }}>{t('level.' + lv.num + '.name')}</span>
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '14px',
                  color: '#bbb',
                  transform: openAccordion === i ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.25s',
                  display: 'inline-block',
                }}
              >
                ▾
              </span>
            </button>

            <div
              style={{
                maxHeight: openAccordion === i ? '1400px' : '0',
                overflow: 'hidden',
                transition: 'max-height 0.35s ease',
                padding: '0 16px',
              }}
            >
              <div style={{ padding: '4px 0 20px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a2744', marginBottom: '8px', lineHeight: 1.5 }}>{t('levels.' + lv.num + '.tagline')}</p>
                <p
                  style={{
                    fontSize: '12px',
                    color: '#5a6a8a',
                    lineHeight: 1.7,
                    marginBottom: '14px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid rgba(0,0,0,0.07)',
                  }}
                >
                  {t('levels.' + lv.num + '.desc')}
                </p>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#1a2744', marginBottom: '10px' }}>
                  {t('levels.goalsHeading')}
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px', padding: 0, margin: 0 }}>
                  {Array.from({ length: lv.goalCount }, (_, k) => k + 1).map((g, gi) => (
                    <li key={gi} style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', fontSize: '12px', color: '#3a4a6a', lineHeight: 1.6 }}>
                      <span
                        style={{
                          flexShrink: 0,
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: lv.color,
                          marginTop: '6px',
                          display: 'inline-block',
                        }}
                      />
                      {t('levels.' + lv.num + '.goal.' + g)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── BOTTOM CTA ── */}
      <div style={{ background: '#1a2744', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1.5px, transparent 1.5px)',
            backgroundSize: '22px 22px',
          }}
        />
        <svg
          viewBox="0 0 1440 48"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          aria-hidden="true"
          style={{ display: 'block', width: '100%', lineHeight: 0 }}
        >
          <path d="M0,24 C360,48 1080,0 1440,24 L1440,0 L0,0 Z" fill="#f0f4f8" />
        </svg>

        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: '820px',
            margin: '0 auto',
            padding: 'clamp(36px, 5vw, 64px) clamp(24px, 6vw, 60px) clamp(48px, 6vw, 72px)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '3px',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.5)',
              marginBottom: '14px',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c9a84c', display: 'inline-block' }} />
            {t('levels.cta.eyebrow')}
          </div>

          <h2
            style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 'clamp(24px, 3.2vw, 38px)',
              fontWeight: 900,
              color: '#fff',
              lineHeight: 1.2,
              marginBottom: '20px',
            }}
          >
            {t('levels.cta.title1')}<br />
            <em style={{ color: '#c9a84c', fontStyle: 'italic' }}>{t('levels.cta.title2')}</em>
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '24px' }}>
            <div style={{ width: '36px', height: '2px', background: 'rgba(200,160,32,0.4)', borderRadius: '1px' }} />
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c9a84c' }} />
            <div style={{ width: '36px', height: '2px', background: 'rgba(200,160,32,0.4)', borderRadius: '1px' }} />
          </div>

          {/* p1 and p2 are two halves of ONE sentence -- p1b ends "...aquatic
              confidence —" and p2a picks up with a lowercase "our coaches focus
              on". Rendered as separate paragraphs they read as a sentence that
              breaks off, which is most obvious on a phone where the first half's
              last line is short. One paragraph.

              The joining space is conditional because only the Western locales
              need it: English ends the first half on an em-dash and wants a
              space, while zh-Hant/zh-Hans end on a full-width comma 「，」 which
              already carries its own trailing space in the glyph. */}
          <p style={{ fontSize: 'clamp(13px, 1.3vw, 15px)', color: 'rgba(255,255,255,0.68)', lineHeight: 1.85, marginBottom: '12px' }}>
            {t('levels.cta.p1a')}
            <strong style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{t('levels.cta.p1strong')}</strong>
            {t('levels.cta.p1b')}
            {/[\u3000-\u303F\uFF00-\uFFEF]$/.test(t('levels.cta.p1b')) ? '' : ' '}
            {t('levels.cta.p2a')}
            <strong style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>{t('levels.cta.p2strong')}</strong>
            {t('levels.cta.p2b')}
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', margin: '28px 0 36px' }}>
            {[
              { icon: '🏊', slug: 'levels', value: '9' },
              { icon: '⭐', slug: 'rating', value: '5.0' },
              { icon: '👶', slug: 'ages', value: null },
            ].map((hl) => (
              <div
                key={hl.slug}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.11)',
                  borderRadius: '14px',
                  padding: '16px 24px',
                  minWidth: '130px',
                }}
              >
                <span style={{ fontSize: '22px' }}>{hl.icon}</span>
                <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>{t('levels.hl.' + hl.slug + '.label')}</span>
                <span
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    fontSize: '20px',
                    fontWeight: 700,
                    color: '#c9a84c',
                  }}
                >
                  {hl.value ?? t('levels.hl.ages.value')}
                </span>
              </div>
            ))}
          </div>

          <Link
            href="/register"
            style={{
              display: 'inline-block',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              fontWeight: 700,
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#1a2744',
              background: '#c9a84c',
              border: '2px solid #c9a84c',
              padding: '15px 48px',
              borderRadius: '6px',
              cursor: 'pointer',
              textDecoration: 'none',
              boxShadow: '0 4px 24px rgba(200,160,32,0.28)',
              transition: 'background 0.22s, color 0.22s, transform 0.15s',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.background = 'transparent'
              el.style.color = '#c9a84c'
              el.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement
              el.style.background = '#c9a84c'
              el.style.color = '#1a2744'
              el.style.transform = 'translateY(0)'
            }}
          >
            {t('levels.cta.button')}
          </Link>
          <p style={{ marginTop: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.32)' }}>
            {t('levels.cta.note')}
          </p>
        </div>
      </div>

      {/* ── RESPONSIVE CSS ── */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-levels { display: none !important; }
          .mobile-levels { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mobile-levels { display: none !important; }
        }
      `}</style>
    </div>
  )
}