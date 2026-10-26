'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { useFamilyStatus, isSignedInNow } from '@/lib/use-family-status'
import { BRAND, HERO_GRADIENT, FONT_DISPLAY, FONT_BODY, wakeImage } from '@/lib/brand'
import FitChips, { HAS_FIT } from '@/components/programs/FitChips'
import { activeLocations, showLocations, type Location } from '@/lib/locations'
import { placeName } from '@/lib/location-place'

// The home page has one job: tell a new family how to start, in three steps,
// and let them take the first one. Everything else on it -- the four ways to
// swim, what parents see after each lesson, three questions -- exists to make
// that first step feel safe. (Owner, 2026-09: no stat tiles, no reviews.)

const NAVY = BRAND.navy
const INK = BRAND.ink
const AMBER = BRAND.amber
const YELLOW = BRAND.yellow
const BLUE = BRAND.blue

// Two pools (2026-10-09): `locations` is every pool, read by the page on the
// server. While only one is open to families nothing below changes -- the
// hero still says Brea and there is no locations section.
export default function HomeContent({ locations = [] }: { locations?: Location[] }) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const { signedIn, allAssessed } = useFamilyStatus()
  const place = placeName(locations, t)
  const pools = showLocations(locations) ? activeLocations(locations) : []
  // Booking already set to that pool; a signed-out visitor registers first
  // and is carried on there, as with bookAssessment above.
  const bookAt = (id: string) => {
    const href = '/booking?location=' + encodeURIComponent(id)
    return signedIn === false ? '/register?next=' + encodeURIComponent(href) : href
  }

  // Booking lives behind the login: a signed-out visitor registers first and is
  // carried on to booking; a signed-in one goes straight there. A press before
  // the sign-in check has answered waits for it, rather than sending a
  // signed-in parent to a blank register form (found 2026-10-08).
  const bookAssessment = async () => {
    const inNow = signedIn ?? await isSignedInNow()
    router.push(inNow ? '/booking' : '/register?next=/booking')
  }
  // Every swimmer already has a level: the next thing is a lesson, not the
  // assessment (same rule as /plans).
  const bookLabel = allAssessed ? t('common.ctaBookLesson') : t('home.hero.cta')

  const programs = [
    { slug: 'private' },
    { slug: 'semi' },
    { slug: 'group' },
    { slug: 'team' },
  ] as const

  return (
    <>
      <style>{`
        .h-root { font-family: ${FONT_BODY}; color: ${INK}; }
        .h-wrap { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
        .h-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 2.5px; text-transform: uppercase; color: ${BLUE}; }
        .h-hero .h-eyebrow { color: ${YELLOW}; }
        .h-root h1, .h-root h2 { font-family: ${FONT_DISPLAY}; margin: 0; text-wrap: balance; }
        /* Chinese has no true italic -- the browser would just slant the glyphs. */
        .h-root.zh h1 em, .h-root.zh h2 em { font-style: normal; }
        .h-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border-radius: 10px;
                 font-weight: 700; font-size: 15px; padding: 15px 26px; border: 1.5px solid transparent; cursor: pointer;
                 text-decoration: none; font-family: inherit; }
        .h-btn.gold { background: ${AMBER}; color: ${NAVY}; }
        .h-btn.gold:hover { background: ${BRAND.amberHover}; }
        .h-btn.ghost { border-color: rgba(255,255,255,0.45); color: #fff; background: transparent; }
        .h-btn.dark { background: ${INK}; color: #fff; }

        /* Hero. One motif: our own logo, turned white and faded right back,
           centred in the section, behind both the headline and the steps card. (Owner, 2026-09: replaced the lane lines.) The
           filter turns every opaque pixel of the colour logo white; its
           transparent background stays transparent. */
        .h-hero { background: ${wakeImage(BRAND.paper)} bottom / 100% 130px no-repeat, radial-gradient(closest-side, rgba(32,80,160,0.35), transparent) right -10% top -30% / 60% 130% no-repeat, ${HERO_GRADIENT}; color: #fff; position: relative; overflow: hidden; margin-top: calc(-1 * var(--nav-space, 0px)); }
        .h-hero::before { content: ''; position: absolute; pointer-events: none;
          width: 1400px; height: 1400px; left: 50%; top: 50%; transform: translate(-50%, -50%);
          background: url('/logo.png') center / contain no-repeat;
          filter: brightness(0) invert(1); opacity: 0.022; }
        .h-hero .h-wrap { position: relative; z-index: 1; display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 56px;
                          align-items: center; padding-top: calc(80px + var(--nav-space, 0px)); padding-bottom: 150px; }
        .h-hero h1 { font-size: 54px; line-height: 1.08; font-weight: 900; margin: 14px 0 18px; }
        .h-hero h1 em { color: ${YELLOW}; }
        .h-lead { font-size: 18px; line-height: 1.65; color: rgba(255,255,255,0.82); max-width: 520px; margin: 0 0 30px; }
        .h-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
        .h-facts { display: flex; gap: 22px; flex-wrap: wrap; margin-top: 28px; font-size: 13.5px; color: rgba(255,255,255,0.7); }
        .h-facts span::before { content: ''; display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${YELLOW};
                                margin-right: 8px; vertical-align: middle; }

        .h-steps { background: #fff; color: ${INK}; border-radius: 18px; padding: 28px; box-shadow: 0 30px 60px rgba(0,0,0,0.35); }
        .h-steps h3 { margin: 0 0 4px; font-size: 18px; }
        .h-steps .sub { font-size: 13px; color: ${BRAND.mute}; margin: 0 0 20px; }
        .h-step { display: grid; grid-template-columns: 34px 1fr; gap: 14px; padding: 14px 0; border-top: 1px solid ${BRAND.line}; }
        .h-step b { width: 34px; height: 34px; border-radius: 50%; background: ${BLUE}; color: #fff; display: grid; place-items: center; font-size: 14px; }
        .h-step:first-of-type b { background: ${AMBER}; color: ${NAVY}; }
        .h-step h4 { margin: 2px 0 3px; font-size: 15px; }
        .h-step p { margin: 0; font-size: 13.5px; color: ${BRAND.mute}; line-height: 1.55; }
        .h-steps .h-btn { width: 100%; margin-top: 14px; }

        .h-sec { padding: 88px 0; }
        /* Adaptive swim: one navy band between the programmes and the why. */
        .h-adapt { padding: 0 0 88px; background: ${BRAND.paper}; }
        .h-adapt .box { background: ${NAVY}; color: #fff; border-radius: 22px; padding: 36px 40px;
          display: grid; grid-template-columns: 1fr auto; gap: 28px; align-items: center; }
        .h-adapt .h-eyebrow { color: ${YELLOW}; }
        .h-adapt h2 { font-family: ${FONT_DISPLAY}; font-size: 30px; line-height: 1.2; margin: 8px 0 0; }
        .h-adapt p { color: rgba(255,255,255,.82); font-size: 16px; line-height: 1.65; margin: 10px 0 0; max-width: 60ch; }
        .h-head { max-width: 640px; margin-bottom: 40px; }
        .h-head h2 { font-size: 38px; line-height: 1.15; margin-top: 10px; }
        /* Chinese headings break at the comma, not mid-phrase ("看 / 得見"). */
        .h-why .h-head h2:lang(zh-Hant), .h-why .h-head h2:lang(zh-Hans) { word-break: keep-all; }
        .h-head p { color: ${BRAND.mute}; font-size: 16px; line-height: 1.65; margin: 12px 0 0; }

        .h-progs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .h-prog { border: 1px solid ${BRAND.line}; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 10px; background: #fff; }
        .h-prog .k { font-size: 12px; font-weight: 800; letter-spacing: 1px; color: ${BLUE}; text-transform: uppercase; }
        .h-prog h3 { margin: 0; font-size: 20px; }
        .h-prog p { margin: 0; font-size: 14px; color: ${BRAND.mute}; line-height: 1.6; flex: 1; }
        .h-prog .pr { display: flex; align-items: baseline; gap: 6px; border-top: 1px solid ${BRAND.line}; padding-top: 14px; }
        .h-prog .pr a { font-size: 14px; font-weight: 800; color: ${BLUE}; text-decoration: none; }
        .h-prog .pr a:hover { text-decoration: underline; }
        .h-prog.team { background: ${NAVY}; color: #fff; border-color: ${NAVY}; }
        .h-prog.team p, .h-prog.team .k { color: rgba(255,255,255,0.6); }
        .h-prog.team .pr a { color: ${BRAND.yellow}; }
        .h-prog.team .pr { border-color: rgba(255,255,255,0.12); }
        .h-note { font-size: 13px; color: ${BRAND.mute}; margin-top: 18px; line-height: 1.6; }
        .h-note a { color: ${BLUE}; font-weight: 700; border-bottom: 1.5px solid ${AMBER}; text-decoration: none; }

        .h-why { background: #fff; }
        .h-paper { background: ${BRAND.paper}; }
        .h-whygrid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
        .h-pts { display: flex; flex-direction: column; gap: 22px; }
        .h-pt { display: grid; grid-template-columns: 44px 1fr; gap: 16px; }
        .h-pt i { width: 44px; height: 44px; border-radius: 12px; background: #fff; border: 1px solid ${BRAND.line}; display: grid; place-items: center;
                  font-style: normal; font-size: 18px; color: ${BLUE}; font-weight: 900; font-family: ${FONT_DISPLAY}; }
        .h-pt h4 { margin: 2px 0 4px; font-size: 16px; }
        .h-pt p { margin: 0; font-size: 14px; color: ${BRAND.mute}; line-height: 1.6; }

        /* What a parent sees after a lesson: a picture of the real student card. */
        .h-phone { background: ${BRAND.navyDeep}; border-radius: 30px; padding: 14px; max-width: 370px; margin: 0 auto; box-shadow: 0 30px 60px rgba(17,29,56,0.25); }
        .h-pscreen { background: #f4f7fb; border-radius: 20px; padding: 14px; }
        .h-pcard { position: relative; overflow: hidden; border-radius: 18px; padding: 16px; color: #fff; background: linear-gradient(145deg, #1d3f7c, #12254a 65%); }
        .h-pcard::after { content: ''; position: absolute; right: -60px; bottom: -70px; width: 220px; height: 220px; border-radius: 50%; background: radial-gradient(closest-side, rgba(240,196,25,0.28), transparent); pointer-events: none; }
        .h-pcard > * { position: relative; z-index: 1; }
        .h-pcard .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
        .h-pcard .eb { font-size: 10px; font-weight: 800; letter-spacing: 2px; color: rgba(255,255,255,0.6); padding-top: 2px; }
        .h-pcard .qr { background: #fff; color: ${NAVY}; border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 800; white-space: nowrap; }
        .h-pcard .nm { font-family: var(--font-display), 'PingFang TC', serif; font-size: 24px; font-weight: 900; margin-top: 4px; }
        .h-pcard .st { font-size: 12px; color: rgba(255,255,255,0.68); }
        .h-pcard .lv { display: inline-flex; align-items: center; gap: 7px; margin-top: 10px; background: rgba(255,255,255,0.12); border-radius: 999px; padding: 5px 11px; font-size: 12px; font-weight: 800; }
        .h-pcard .lv i { width: 8px; height: 8px; border-radius: 50%; background: #f0c419; }
        .h-bar { height: 6px; background: rgba(255,255,255,0.15); border-radius: 3px; margin: 12px 0 6px; overflow: hidden; }
        .h-bar i { display: block; height: 100%; width: 66%; background: #f7b733; border-radius: 3px; }
        .h-pcard .pc { display: flex; justify-content: space-between; font-size: 12px; color: rgba(255,255,255,0.72); }
        .h-pcard .pc b { color: #f7b733; }
        .h-pcard .nx { margin-top: 10px; border-radius: 12px; background: rgba(255,255,255,0.08); }
        .h-pcard .nx > div { display: flex; gap: 10px; align-items: center; padding: 9px 11px; font-size: 14px; font-weight: 800; }
        .h-pcard .nx > div + div { border-top: 1px solid rgba(255,255,255,0.1); }
        .h-pcard .nx small { display: block; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.65); }
        .h-pcard .ic { width: 28px; height: 28px; flex: none; border-radius: 8px; background: rgba(255,255,255,0.14); display: grid; place-items: center; font-size: 14px; }
        .h-pcard .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 10px; }
        .h-pcard .two span { background: rgba(255,255,255,0.12); border-radius: 10px; padding: 9px 6px; text-align: center; font-size: 12.5px; font-weight: 800; }
        .h-noteb { background: #fff; border-radius: 14px; padding: 12px; margin-top: 12px; font-size: 13px; line-height: 1.55; color: ${NAVY}; }
        .h-noteb small { display: block; color: #a86800; font-weight: 800; margin-bottom: 4px; font-size: 11.5px; letter-spacing: 0.5px; }
        .h-cap { text-align: center; font-size: 12px; color: ${BRAND.mute}; margin-top: 14px; }

        .h-qs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
        .h-q { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 14px; padding: 22px; }
        .h-q h4 { margin: 0 0 8px; font-size: 15px; }
        .h-q p { margin: 0; font-size: 14px; color: ${BRAND.mute}; line-height: 1.6; }

        /* Our locations: one card per pool, only with more than one open. */
        .h-locs { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
        .h-loc { border: 1px solid ${BRAND.line}; border-radius: 16px; padding: 24px; background: #fff; display: flex; flex-direction: column; gap: 6px; }
        .h-loc h3 { margin: 0; font-family: ${FONT_DISPLAY}; font-size: 22px; color: ${NAVY}; }
        .h-loc p { margin: 0; font-size: 14px; color: ${BRAND.mute}; line-height: 1.6; }
        .h-loc .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; margin-top: auto; padding-top: 14px; border-top: 1px solid ${BRAND.line}; }
        .h-loc .acts .h-btn { padding: 10px 18px; font-size: 14px; }
        .h-loc .acts a.v { font-size: 14px; font-weight: 800; color: ${BLUE}; text-decoration: none; }
        @media (hover: hover) { .h-loc .acts a.v:hover { text-decoration: underline; } }
        .h-locs-sec .h-head { margin-bottom: 28px; }

        .h-final { background: ${HERO_GRADIENT}; color: #fff; text-align: center; }
        .h-final h2 { font-size: 44px; line-height: 1.12; font-weight: 900; }
        .h-final h2 em { color: ${YELLOW}; }
        .h-final p { color: rgba(255,255,255,0.8); margin: 16px auto 30px; max-width: 520px; line-height: 1.6; }
        .h-final .h-ctas { justify-content: center; }

        @media (max-width: 900px) {
          .h-hero { background-size: 100% 70px, 60% 130%, auto; }
          .h-hero .h-wrap { grid-template-columns: 1fr; padding-top: calc(48px + var(--nav-space, 0px)); padding-bottom: 96px; gap: 36px; }
          .h-hero h1 { font-size: 38px; }
          .h-hero::before { width: 420px; height: 420px; left: 50%; top: 32%; transform: translate(-50%, -50%); }
          .h-progs { grid-template-columns: 1fr 1fr; }
          .h-whygrid { grid-template-columns: 1fr; }
          .h-qs { grid-template-columns: 1fr; }
          .h-sec { padding: 60px 0; }
          .h-adapt { padding-bottom: 60px; }
          .h-adapt .box { grid-template-columns: 1fr; padding: 28px; }
          .h-adapt h2 { font-size: 24px; }
          .h-head h2 { font-size: 30px; }
          .h-final h2 { font-size: 32px; }
        }
        @media (max-width: 520px) {
          .h-progs { grid-template-columns: 1fr; }
          /* Grow to fill the row, but start from the label's own width: two
             buttons share a row only when both labels fit on one line, and
             otherwise each takes a full row of its own instead of squeezing
             "Book a Swim Assessment" into three lines. */
          .h-ctas .h-btn { flex: 1 1 auto; }
        }
      `}</style>

      <div className={'h-root' + (locale.startsWith('zh') ? ' zh' : '')}>
        {/* HERO: the promise on the left, the three steps on the right. */}
        <header className="h-hero">
          <div className="h-wrap">
            <div>
              <div className="h-eyebrow">{t('home.hero.eyebrow', { place })}</div>
              <h1>{t('home.hero.title1')}<br /><em>{t('home.hero.title2')}</em></h1>
              <p className="h-lead">{t('home.hero.subtitle')}</p>
              <div className="h-ctas">
                <button className="h-btn gold tap-auto" onClick={bookAssessment}>{bookLabel} →</button>
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
                    <p>{t(`home.start.s${n}.body`)}</p>
                  </div>
                </div>
              ))}
              {signedIn
                ? <Link className="h-btn dark tap-auto" href="/dashboard">{t('home.start.ctaSignedIn')}</Link>
                : <Link className="h-btn dark tap-auto" href="/register">{t('home.start.cta')}</Link>}
            </aside>
          </div>
        </header>

        {/* PROGRAMS: who each lesson suits; the price is one tap away on /plans. */}
        <section className="h-sec h-paper">
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
                  {HAS_FIT.has(p.slug)
                    ? <FitChips slug={p.slug as 'private' | 'semi' | 'group'} />
                    : <p>{t(`home.program.${p.slug}.desc`)}</p>}
                  {/* Prices live on the Points & Pricing page only (owner, 2026-09-28). */}
                  <div className="pr">
                    <Link href={localePath('/plans', locale)}>{t('programs.card.pricing')} →</Link>
                  </div>
                </div>
              ))}
            </div>
            <p className="h-note">
              {t('home.programs.note')}{' '}
              <Link href={localePath('/plans', locale)}>{t('home.programs.noteLink')}</Link>
              {' · '}
              <Link href={localePath('/programs', locale)}>{t('adapt.crumb')}</Link>
            </p>
          </div>
        </section>

        <section className="h-adapt">
          <div className="h-wrap">
            <div className="box">
              <div>
                <div className="h-eyebrow">{t('adapt.home.eyebrow')}</div>
                <h2>{t('adapt.home.title')}</h2>
                <p>{t('adapt.home.body')}</p>
              </div>
              <Link className="h-btn gold tap-auto" href={localePath('/adaptive-swim', locale)}>{t('adapt.home.cta')} →</Link>
            </div>
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
                {[['7', 1], ['🎖', 2], ['✎', 3]].map(([icon, n]) => (
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
              <div className="h-phone" aria-hidden><div className="h-pscreen">
                {/* The child card a family sees in their account (owner,
                    2026-10-26: version B's words with version A's picture). */}
                <div className="h-pcard">
                  <div className="top"><span className="eb">MANTA SHARK · SWIMMER</span><span className="qr">▦ {t('dash.checkIn')}</span></div>
                  <div className="nm">Ethan</div>
                  <div className="st">{t('home.preview.age')}</div>
                  <div className="lv"><i />{t('levels.levelN', { n: 3 })} · {t('level.3.name')} · {t('dash.stageN', { n: 2 })}</div>
                  <div className="h-bar"><i /></div>
                  <div className="pc"><span>{t('stage.3.2.name')}</span><b>66%</b></div>
                  <div className="nx">
                    <div><span className="ic">📅</span><span><small>{t('dash.next.lesson')}</small>{t('home.preview.next')}</span></div>
                  </div>
                  <div className="two"><span>{t('dash.skillTree')}</span><span>{t('dash.records')}</span></div>
                </div>
                <div className="h-noteb"><small>{t('home.preview.noteLabel')}</small>{t('home.preview.note')}</div>
              </div></div>
              <p className="h-cap">{t('home.preview.caption')}</p>
            </div>
          </div>
        </section>

        {/* QUESTIONS: the three a new family asks before booking. */}
        <section className="h-sec h-paper">
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

        {/* OUR LOCATIONS: only once there is more than one pool to choose from.
            Same programmes and prices everywhere, so a card is just where it
            is, its own page, and booking already set to that pool. */}
        {pools.length > 0 && (
          <section className="h-sec h-why h-locs-sec">
            <div className="h-wrap">
              <div className="h-head">
                <div className="h-eyebrow">{t('home.locations.eyebrow')}</div>
                <h2>{t('home.locations.title')}</h2>
                <p>{t('home.locations.sub')}</p>
              </div>
              <div className="h-locs">
                {pools.map(l => {
                  const addr = (l.address || '').trim()
                  return (
                    <div className="h-loc" key={l.id}>
                      <h3>{l.name}</h3>
                      {addr && addr.toLowerCase() !== l.name.trim().toLowerCase() && <p>{addr}</p>}
                      <div className="acts">
                        <Link className="h-btn gold tap-auto" href={bookAt(l.id)}>{t('home.locations.book')}</Link>
                        <Link className="v" href={localePath('/locations/' + l.id, locale)}>{t('home.locations.view')} →</Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* CLOSING: the school's own line, kept by the owner's choice. */}
        <section className="h-sec h-final">
          <div className="h-wrap">
            <h2>{t('home.final.title1')}<br /><em>{t('home.final.title2')}</em></h2>
            <p>{t('home.final.sub')}</p>
            <div className="h-ctas">
              {signedIn
                ? <button className="h-btn gold tap-auto" onClick={bookAssessment}>{bookLabel}</button>
                : <Link className="h-btn gold tap-auto" href="/register">{t('home.final.cta')}</Link>}
              <Link className="h-btn ghost tap-auto" href={localePath('/plans', locale)}>{t('home.hero.prices')}</Link>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
