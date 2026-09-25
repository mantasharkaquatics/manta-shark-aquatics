'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { createClient } from '@/lib/supabase/client'
import { BASE_POINTS } from '@/lib/points'
import { TRIAL_PRICE_CENTS } from '@/lib/plans'

// The home page has one job: tell a new family how to start, in three steps,
// and let them take the first one. Everything else on it -- the four ways to
// swim, what parents see after each lesson, three questions -- exists to make
// that first step feel safe. (Owner, 2026-09: no stat tiles, no reviews.)

const NAVY = '#0f1a33'
const INK = '#111d38'
const GOLD = '#c9a84c'

export default function HomeContent() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setSignedIn(!!data.user)).catch(() => setSignedIn(false))
  }, [])

  // Booking lives behind the login: a signed-out visitor registers first and is
  // carried on to booking; a signed-in one goes straight there.
  const bookAssessment = () => router.push(signedIn ? '/booking' : '/register?redirect=/booking')
  const price = '$' + (TRIAL_PRICE_CENTS / 100).toLocaleString()

  const programs = [
    { slug: 'private', price: BASE_POINTS['1on1'], unit: 'home.program.per30' },
    { slug: 'semi', price: BASE_POINTS['1on2'], unit: 'home.program.perSwimmer' },
    { slug: 'group', price: BASE_POINTS['1on4'], unit: 'home.program.perSwimmer' },
    { slug: 'team', price: null, unit: 'home.program.membership' },
  ] as const

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=DM+Sans:wght@400;500;600;700&display=swap');
        .h-root { font-family: 'DM Sans', sans-serif; color: ${INK}; }
        .h-wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
        .h-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; color: ${GOLD}; }
        .h-root h1, .h-root h2 { font-family: 'Playfair Display', Georgia, serif; margin: 0; text-wrap: balance; }
        .h-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 10px;
                 font-weight: 700; font-size: 15px; padding: 15px 26px; border: 1.5px solid transparent; cursor: pointer;
                 text-decoration: none; font-family: inherit; }
        .h-btn.gold { background: ${GOLD}; color: ${NAVY}; }
        .h-btn.ghost { border-color: rgba(255,255,255,0.35); color: #fff; background: transparent; }
        .h-btn.dark { background: ${INK}; color: #fff; }

        /* Hero. One motif: our own logo, turned white and faded right back,
           whole, centred behind the headline column. (Owner, 2026-09: replaced the lane lines.) The
           filter turns every opaque pixel of the colour logo white; its
           transparent background stays transparent. */
        .h-hero { background: ${NAVY}; color: #fff; position: relative; overflow: hidden; }
        .h-hero::before { content: ''; position: absolute; pointer-events: none;
          width: 1100px; height: 1100px; left: max(-220px, calc(50% - 800px)); top: 50%; transform: translateY(-50%);
          background: url('/logo.png') center / contain no-repeat;
          filter: brightness(0) invert(1); opacity: 0.05; }
        .h-hero::after { content: ''; position: absolute; right: -10%; top: -30%; width: 60%; height: 160%; pointer-events: none;
          background: radial-gradient(closest-side, rgba(63,111,181,0.25), transparent); }
        .h-hero .h-wrap { position: relative; z-index: 1; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 56px;
                          align-items: center; padding-top: 80px; padding-bottom: 88px; }
        .h-hero h1 { font-size: 54px; line-height: 1.08; font-weight: 900; margin: 14px 0 18px; }
        .h-hero h1 em { color: ${GOLD}; }
        .h-lead { font-size: 18px; line-height: 1.65; color: rgba(255,255,255,0.72); max-width: 520px; margin: 0 0 30px; }
        .h-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
        .h-facts { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 28px; font-size: 13px; color: rgba(255,255,255,0.55); }
        .h-facts span::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${GOLD};
                                margin-right: 8px; vertical-align: middle; }

        .h-steps { background: #fff; color: ${INK}; border-radius: 18px; padding: 28px; box-shadow: 0 30px 60px rgba(0,0,0,0.35); }
        .h-steps h3 { margin: 0 0 4px; font-size: 18px; }
        .h-steps .sub { font-size: 13px; color: #5d6b86; margin: 0 0 20px; }
        .h-step { display: grid; grid-template-columns: 34px 1fr; gap: 14px; padding: 14px 0; border-top: 1px solid #e3e8f0; }
        .h-step b { width: 34px; height: 34px; border-radius: 50%; background: ${INK}; color: #fff; display: grid; place-items: center; font-size: 14px; }
        .h-step:first-of-type b { background: ${GOLD}; color: ${NAVY}; }
        .h-step h4 { margin: 2px 0 3px; font-size: 15px; }
        .h-step p { margin: 0; font-size: 13px; color: #5d6b86; line-height: 1.55; }
        .h-steps .h-btn { width: 100%; margin-top: 14px; }

        .h-sec { padding: 88px 0; }
        .h-head { max-width: 640px; margin-bottom: 40px; }
        .h-head h2 { font-size: 38px; line-height: 1.15; margin-top: 10px; }
        .h-head p { color: #5d6b86; font-size: 16px; line-height: 1.65; margin: 12px 0 0; }

        .h-progs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .h-prog { border: 1px solid #e3e8f0; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 10px; background: #fff; }
        .h-prog .k { font-size: 12px; font-weight: 700; letter-spacing: 1px; color: #5d6b86; text-transform: uppercase; }
        .h-prog h3 { margin: 0; font-size: 20px; }
        .h-prog p { margin: 0; font-size: 14px; color: #5d6b86; line-height: 1.6; flex: 1; }
        .h-prog .pr { display: flex; align-items: baseline; gap: 6px; border-top: 1px solid #e3e8f0; padding-top: 14px; }
        .h-prog .pr b { font-family: 'Playfair Display', serif; font-size: 28px; }
        .h-prog .pr span { font-size: 12px; color: #5d6b86; }
        .h-prog.team { background: ${INK}; color: #fff; border-color: ${INK}; }
        .h-prog.team p, .h-prog.team .k, .h-prog.team .pr span { color: rgba(255,255,255,0.6); }
        .h-prog.team .pr { border-color: rgba(255,255,255,0.12); }
        .h-note { font-size: 13px; color: #5d6b86; margin-top: 18px; line-height: 1.6; }
        .h-note a { color: ${INK}; font-weight: 700; border-bottom: 1.5px solid ${GOLD}; text-decoration: none; }

        .h-why { background: #f4f6fa; }
        .h-whygrid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
        .h-pts { display: flex; flex-direction: column; gap: 22px; }
        .h-pt { display: grid; grid-template-columns: 44px 1fr; gap: 16px; }
        .h-pt i { width: 44px; height: 44px; border-radius: 12px; background: #fff; border: 1px solid #e3e8f0; display: grid; place-items: center;
                  font-style: normal; font-size: 18px; color: ${GOLD}; font-weight: 900; font-family: 'Playfair Display', serif; }
        .h-pt h4 { margin: 2px 0 4px; font-size: 16px; }
        .h-pt p { margin: 0; font-size: 14px; color: #5d6b86; line-height: 1.6; }

        /* What a parent sees after a lesson: a picture of the real student card. */
        .h-phone { background: ${NAVY}; border-radius: 28px; padding: 18px; max-width: 360px; margin: 0 auto; box-shadow: 0 30px 60px rgba(17,29,56,0.25); }
        .h-pcard { background: #1a2744; border-radius: 16px; padding: 18px; color: #fff; border-top: 3px solid #e05a4a; }
        .h-pcard .n { display: flex; gap: 10px; align-items: center; }
        .h-pcard .av { width: 38px; height: 38px; border-radius: 50%; background: #e05a4a; display: grid; place-items: center; font-weight: 800; }
        .h-pcard .lv { font-weight: 700; margin-top: 14px; }
        .h-pcard .st { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 2px; }
        .h-bar { height: 6px; background: rgba(255,255,255,0.12); border-radius: 3px; margin: 12px 0 6px; overflow: hidden; }
        .h-bar i { display: block; height: 100%; width: 67%; background: ${GOLD}; }
        .h-pcard .pc { display: flex; justify-content: space-between; font-size: 11px; color: rgba(255,255,255,0.5); }
        .h-skills { display: flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
        .h-skills span { font-size: 11px; padding: 4px 8px; border-radius: 6px; background: rgba(143,220,194,0.12); color: #8fdcc2; }
        .h-skills span.o { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.5); }
        .h-noteb { background: rgba(255,255,255,0.06); border-radius: 10px; padding: 12px; margin-top: 14px; font-size: 12.5px; line-height: 1.55; color: rgba(255,255,255,0.8); }
        .h-noteb small { display: block; color: ${GOLD}; font-weight: 700; margin-bottom: 4px; font-size: 11px; letter-spacing: 0.5px; }
        .h-cap { text-align: center; font-size: 12px; color: #5d6b86; margin-top: 14px; }

        .h-qs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .h-q { background: #fff; border: 1px solid #e3e8f0; border-radius: 14px; padding: 22px; }
        .h-q h4 { margin: 0 0 8px; font-size: 15px; }
        .h-q p { margin: 0; font-size: 14px; color: #5d6b86; line-height: 1.6; }

        .h-final { background: ${NAVY}; color: #fff; text-align: center; }
        .h-final h2 { font-size: 44px; line-height: 1.12; font-weight: 900; }
        .h-final h2 em { color: ${GOLD}; }
        .h-final p { color: rgba(255,255,255,0.65); margin: 16px auto 30px; max-width: 520px; line-height: 1.6; }
        .h-final .h-ctas { justify-content: center; }

        @media (max-width: 900px) {
          .h-hero .h-wrap { grid-template-columns: 1fr; padding-top: 48px; padding-bottom: 56px; gap: 36px; }
          .h-hero h1 { font-size: 38px; }
          .h-hero::before { width: 420px; height: 420px; left: 50%; top: 32%; transform: translate(-50%, -50%); }
          .h-progs { grid-template-columns: 1fr 1fr; }
          .h-whygrid { grid-template-columns: 1fr; }
          .h-qs { grid-template-columns: 1fr; }
          .h-sec { padding: 60px 0; }
          .h-head h2 { font-size: 30px; }
          .h-final h2 { font-size: 32px; }
        }
        @media (max-width: 520px) {
          .h-progs { grid-template-columns: 1fr; }
          .h-ctas .h-btn { flex: 1; }
        }
      `}</style>

      <div className="h-root">
        {/* HERO: the promise on the left, the three steps on the right. */}
        <header className="h-hero">
          <div className="h-wrap">
            <div>
              <div className="h-eyebrow">{t('home.hero.eyebrow')}</div>
              <h1>{t('home.hero.title1')}<br /><em>{t('home.hero.title2')}</em></h1>
              <p className="h-lead">{t('home.hero.subtitle')}</p>
              <div className="h-ctas">
                <button className="h-btn gold tap-auto" onClick={bookAssessment}>{t('home.hero.cta')} →</button>
                <Link className="h-btn ghost tap-auto" href={localePath('/plans', locale)}>{t('home.hero.prices')}</Link>
              </div>
              <div className="h-facts">
                <span>{t('home.hero.fact1')}</span><span>{t('home.hero.fact2')}</span><span>{t('home.hero.fact3')}</span>
              </div>
            </div>

            <aside className="h-steps" aria-label={t('home.start.title')}>
              <h3>{t('home.start.title')}</h3>
              <p className="sub">{t('home.start.sub')}</p>
              {[1, 2, 3].map(n => (
                <div className="h-step" key={n}>
                  <b>{n}</b>
                  <div>
                    <h4>{t(`home.start.s${n}.title`)}</h4>
                    <p>{t(`home.start.s${n}.body`, { price })}</p>
                  </div>
                </div>
              ))}
              {signedIn
                ? <Link className="h-btn dark tap-auto" href="/dashboard">{t('home.start.ctaSignedIn')}</Link>
                : <Link className="h-btn dark tap-auto" href="/register">{t('home.start.cta')}</Link>}
            </aside>
          </div>
        </header>

        {/* PROGRAMS: price on the card, nothing hidden behind a tap. */}
        <section className="h-sec">
          <div className="h-wrap">
            <div className="h-head">
              <div className="h-eyebrow">{t('home.programs.eyebrow')}</div>
              <h2>{t('home.programs.title')}</h2>
              <p>{t('home.programs.sub')}</p>
            </div>
            <div className="h-progs">
              {programs.map(p => (
                <div key={p.slug} className={'h-prog' + (p.slug === 'team' ? ' team' : '')}>
                  <div className="k">{t(`home.program.${p.slug}.kind`)}</div>
                  <h3>{t(`home.program.${p.slug}.name`)}</h3>
                  <p>{t(`home.program.${p.slug}.desc`)}</p>
                  <div className="pr">
                    <b>{p.price === null ? t('home.program.monthly') : '$' + p.price}</b>
                    <span>{t(p.unit)}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="h-note">
              {t('home.programs.note')}{' '}
              <Link href={localePath('/plans', locale)}>{t('home.programs.noteLink')}</Link>
            </p>
          </div>
        </section>

        {/* WHY: what makes us different, shown rather than claimed. */}
        <section className="h-sec h-why">
          <div className="h-wrap h-whygrid">
            <div>
              <div className="h-head" style={{ marginBottom: '28px' }}>
                <div className="h-eyebrow">{t('home.why.eyebrow')}</div>
                <h2>{t('home.why.title')}</h2>
              </div>
              <div className="h-pts">
                {[['7', 1], ['✓', 2], ['✎', 3]].map(([icon, n]) => (
                  <div className="h-pt" key={n}>
                    <i aria-hidden>{icon}</i>
                    <div>
                      <h4>{t(`home.why.w${n}.title`)}</h4>
                      <p>{t(`home.why.w${n}.body`)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="h-note">
                <Link href={localePath('/levels', locale)}>{t('home.why.levelsLink')}</Link>
              </p>
            </div>
            <div>
              <div className="h-phone" aria-hidden>
                <div className="h-pcard">
                  <div className="n">
                    <div className="av">E</div>
                    <div><b>Ethan</b><div className="st">{t('home.preview.age')}</div></div>
                  </div>
                  <div className="lv">{t('levels.levelN', { n: 3 })} · {t('level.3.name')}</div>
                  <div className="st">{t('dash.stageN', { n: 2 })} · {t('stage.3.2.name')}</div>
                  <div className="h-bar"><i /></div>
                  <div className="pc"><span>{t('dash.stageCompletion')}</span><span>{t('home.preview.count')}</span></div>
                  <div className="h-skills">
                    <span>{t('home.preview.skill1')} ✓</span>
                    <span>{t('home.preview.skill2')} ✓</span>
                    <span className="o">{t('home.preview.skill3')}</span>
                  </div>
                  <div className="h-noteb"><small>{t('home.preview.noteLabel')}</small>{t('home.preview.note')}</div>
                </div>
              </div>
              <p className="h-cap">{t('home.preview.caption')}</p>
            </div>
          </div>
        </section>

        {/* QUESTIONS: the three a new family asks before booking. */}
        <section className="h-sec">
          <div className="h-wrap">
            <div className="h-head">
              <div className="h-eyebrow">{t('home.faq.eyebrow')}</div>
              <h2>{t('home.faq.title')}</h2>
            </div>
            <div className="h-qs">
              {[1, 2, 3].map(n => (
                <div className="h-q" key={n}>
                  <h4>{t(`home.faq.q${n}`)}</h4>
                  <p>{t(`home.faq.a${n}`)}</p>
                </div>
              ))}
            </div>
            <p className="h-note"><Link href={localePath('/faq', locale)}>{t('home.faq.all')}</Link></p>
          </div>
        </section>

        {/* CLOSING: the school's own line, kept by the owner's choice. */}
        <section className="h-sec h-final">
          <div className="h-wrap">
            <h2>{t('home.final.title1')}<br /><em>{t('home.final.title2')}</em></h2>
            <p>{t('home.final.sub')}</p>
            <div className="h-ctas">
              {signedIn
                ? <button className="h-btn gold tap-auto" onClick={bookAssessment}>{t('home.hero.cta')}</button>
                : <Link className="h-btn gold tap-auto" href="/register">{t('home.final.cta')}</Link>}
              <Link className="h-btn ghost tap-auto" href={localePath('/plans', locale)}>{t('home.hero.prices')}</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
