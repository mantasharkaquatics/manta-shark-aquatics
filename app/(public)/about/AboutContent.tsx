'use client'

import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { BRAND } from '@/lib/brand'
import BrandRoot from '@/components/brand/BrandRoot'

const coaches = [
  { name: 'Shane', slug: 'shane', accent: '#4a90c4', initials: 'SH' },
  { name: 'Mitch', slug: 'mitch', accent: '#4caf72', initials: 'MT' },
  { name: 'Mitzi', slug: 'mitzi', accent: '#e05a4a', initials: 'MZ' },
]

/* Real photos go here (files in /public), e.g. pool: '/about/pool.jpg'.
   Until there is one, the page shows no picture at all rather than an empty
   grey box with "Pool Photo" written on it: a placeholder reads as an
   unfinished site. The about.photo.* strings become the photos' alt text. */
const PHOTOS: { pool: string | null; swimmer: string | null } = { pool: null, swimmer: null }

// Four separate promises, not steps -- so each gets a small picture, not a number.
const differentiators: { slug: string; icon: React.ReactNode }[] = [
  { slug: 'patient', icon: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6" /></> },
  { slug: 'noRelearn', icon: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></> },
  { slug: 'peace', icon: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></> },
  { slug: 'wellbeing', icon: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /> },
]

const css = `
  .ab-two { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 56px; align-items: center; }
  .ab-two p.b-body + p.b-body { margin-top: 14px; }
  .ab-photo { border-radius: 20px; overflow: hidden; min-height: 380px; background: ${BRAND.paper} center / cover no-repeat; }
  /* Without a photo: what a parent most wants to know, in the brand navy. */
  .ab-facts { background: ${BRAND.navy}; color: #fff; border-radius: 20px; padding: 34px; position: relative; overflow: hidden; }
  .ab-facts::before { content: ''; position: absolute; width: 420px; height: 420px; right: -120px; bottom: -140px; pointer-events: none;
    background: url('/logo.png') center / contain no-repeat; filter: brightness(0) invert(1); opacity: 0.05; }
  .ab-facts ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 18px; position: relative; }
  .ab-facts li { display: flex; align-items: center; gap: 14px; font-size: 18px; font-weight: 700; }
  .ab-facts li::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: ${BRAND.yellow}; flex-shrink: 0; }

  .ab-phil { display: grid; grid-template-columns: 0.8fr 1.2fr; gap: 56px; align-items: start; }
  .ab-phil strong { color: ${BRAND.navy}; }

  .ab-diffs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .ab-ico { width: 44px; height: 44px; border-radius: 12px; background: ${BRAND.paper}; border: 1px solid ${BRAND.line};
    display: grid; place-items: center; margin-bottom: 16px; color: ${BRAND.blue}; }

  .ab-team { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
  .ab-coach { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 20px; overflow: hidden; }
  .ab-coach-top { display: flex; align-items: center; gap: 16px; padding: 24px 24px 20px; border-bottom: 1px solid ${BRAND.line}; }
  .ab-init { width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; color: #fff; flex-shrink: 0;
    font-family: var(--font-display), serif; font-size: 22px; font-weight: 900; }
  .ab-coach h3 { font-family: var(--font-display), serif; font-size: 24px; font-weight: 900; color: ${BRAND.navy}; }
  .ab-role { font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: ${BRAND.blue}; margin-top: 2px; }
  .ab-facts-list { padding: 20px 24px 26px; display: flex; flex-direction: column; gap: 16px; }
  .ab-facts-list small { display: block; font-size: 10.5px; font-weight: 800; letter-spacing: 1.8px; text-transform: uppercase; color: ${BRAND.blue}; margin-bottom: 5px; }
  .ab-facts-list p { margin: 0; font-size: 14px; color: ${BRAND.mute}; line-height: 1.65; }

  .ab-final p strong { color: #fff; font-weight: 700; }
  .ab-note { font-size: 13px !important; color: rgba(255,255,255,0.55) !important; margin-top: 14px !important; }

  @media (max-width: 900px) {
    .ab-two, .ab-phil { grid-template-columns: 1fr; gap: 28px; }
    .ab-diffs { grid-template-columns: 1fr 1fr; }
    .ab-team { grid-template-columns: 1fr; }
    .ab-photo { min-height: 260px; }
  }
  @media (max-width: 560px) {
    .ab-diffs { grid-template-columns: 1fr; }
    .ab-facts { padding: 26px; }
    .ab-facts li { font-size: 16px; }
  }
`

export default function AboutContent() {
  const t = useT()
  const locale = useLocale()
  const zh = locale.startsWith('zh')
  const gap = zh ? '' : ' '

  return (
    <BrandRoot>
      <style>{css}</style>

      {/* ── HERO ── */}
      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">{t('about.hero.eyebrow')}</p>
          <h1>{t('about.hero.title1')}<br /><em>{t('about.hero.title2')}</em></h1>
          <p className="b-lead">{t('about.hero.subtitle')}</p>
        </div>
      </header>

      {/* ── ABOUT US ── */}
      <section className="b-sec">
        <div className="b-wrap ab-two">
          <div>
            <p className="b-eyebrow">{t('about.us.eyebrow')}</p>
            <h2 className="b-h2">{t('about.us.title1')}<br />{t('about.us.title2')}</h2>
            <p className="b-body">{t('about.us.p1')}</p>
            <p className="b-body">{t('about.us.p2')}</p>
            <p className="b-body">{t('about.us.p3')}</p>
          </div>
          {PHOTOS.pool ? (
            <div className="ab-photo" role="img" aria-label={t('about.photo.pool')} style={{ backgroundImage: `url('${PHOTOS.pool}')` }} />
          ) : (
            <div className="ab-facts">
              <ul>
                <li>{t('home.hero.fact1')}</li>
                <li>{t('levels.chip.structure')}</li>
                <li>{t('home.hero.fact2')}</li>
                <li>{t('home.hero.fact3')}</li>
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* ── PHILOSOPHY ── */}
      <section className="b-sec b-paper">
        <div className="b-wrap">
          {PHOTOS.swimmer && (
            <div className="ab-photo" role="img" aria-label={t('about.photo.swimmer')}
              style={{ backgroundImage: `url('${PHOTOS.swimmer}')`, marginBottom: 48 }} />
          )}
          <div className="ab-phil">
            <div>
              <p className="b-eyebrow">{t('about.phil.eyebrow')}</p>
              <h2 className="b-h2">{t('about.phil.title1')}<br />{t('about.phil.title2')}</h2>
            </div>
            <div style={{ paddingTop: 20 }}>
              <p className="b-body" style={{ marginTop: 0 }}>
                {t('about.phil.p1a')}<strong>{t('about.phil.p1strong')}</strong>{t('about.phil.p1b')}
              </p>
              <p className="b-body">
                {t('about.phil.p2a')}<strong>{t('about.phil.p2strong')}</strong>{t('about.phil.p2b')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE DIFFERENCE ── */}
      <section className="b-sec">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('about.diff.eyebrow')}</p>
            <h2>{t('about.diff.title1')}{gap}<em style={{ color: BRAND.blue }}>{t('about.diff.title2')}</em></h2>
            <p>{t('about.diff.subtitle')}</p>
          </div>
          <div className="ab-diffs">
            {differentiators.map(item => (
              <div key={item.slug} className="b-card">
                <div className="ab-ico">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {item.icon}
                  </svg>
                </div>
                <h3>{t('about.diff.' + item.slug + '.title')}</h3>
                <p>{t('about.diff.' + item.slug + '.text')}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── MEET THE TEAM ── */}
      <section className="b-sec b-paper">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('about.team.eyebrow')}</p>
            <h2>{t('about.team.title1')}{gap}<em style={{ color: BRAND.blue }}>{t('about.team.title2')}</em></h2>
            <p>{t('about.team.subtitle')}</p>
          </div>
          <div className="ab-team">
            {coaches.map(coach => (
              <div key={coach.name} className="ab-coach">
                <div className="ab-coach-top">
                  <div className="ab-init" style={{ background: coach.accent }}>{coach.initials}</div>
                  <div>
                    <h3>{coach.name}</h3>
                    <div className="ab-role">{t('about.coach.role')}</div>
                  </div>
                </div>
                <div className="ab-facts-list">
                  {[1, 2, 3].map(i => (
                    <div key={i}>
                      <small>{t('about.coach.' + coach.slug + '.s' + i + '.label')}</small>
                      <p>{t('about.coach.' + coach.slug + '.s' + i + '.text')}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="b-final ab-final">
        <div className="b-wrap">
          <h2>{t('about.cta.title1')}{gap}<em>{t('about.cta.title2')}</em></h2>
          <p style={{ maxWidth: 600 }}>
            {t('about.cta.p1')}<strong>{t('about.cta.pStrong')}</strong>{t('about.cta.p2')}
          </p>
          <div className="b-ctas">
            <Link href="/register" className="b-btn gold">{t('about.cta.button')}</Link>
          </div>
          <p className="ab-note">{t('about.cta.note')}</p>
        </div>
      </section>
    </BrandRoot>
  )
}
