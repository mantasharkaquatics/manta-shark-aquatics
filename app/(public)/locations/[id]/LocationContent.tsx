'use client'

import Link from 'next/link'
import { useT, useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { locationMapUrl, type Location } from '@/lib/locations'
import { BRAND } from '@/lib/brand'
import { useFamilyStatus } from '@/lib/use-family-status'
import BrandRoot from '@/components/brand/BrandRoot'
import ProgramCards from '@/app/(public)/programs/ProgramCards'

/* One pool's page (/locations/[id], and its /zh-Hant and /zh-Hans twins).

   It exists only while more than one pool is open to families -- the page
   files return notFound() otherwise -- so it never has to explain itself to a
   one-pool site. Its job is the question a second pool raises: "is it the same
   school there?" Yes: the same programs, prices and points (owner,
   2026-10-09), so the page says that once, shows who teaches there, and hands
   the family to the booking page already set to this pool (?location=). */

const css = `
  .lc-addr { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; margin: 0 0 14px; font-size: 16px; color: rgba(255,255,255,0.9); font-weight: 600; }
  .lc-addr a { color: ${BRAND.yellow}; font-weight: 700; text-decoration: none; border-bottom: 1.5px solid ${BRAND.amber}; }
  .lc-coaches { display: flex; flex-wrap: wrap; gap: 10px; }
  .lc-coaches span { background: #fff; border: 1px solid ${BRAND.line}; border-radius: 999px; padding: 9px 18px;
    font-size: 15px; font-weight: 700; color: ${BRAND.navy}; }
  .lc-others { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .lc-other { display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: inherit; transition: border-color .15s; }
  .lc-other:hover { border-color: ${BRAND.blue}; }
  .lc-other:focus-visible { outline: 3px solid ${BRAND.yellow}; outline-offset: 2px; }
  .lc-other .go { margin-top: 8px; font-size: 14px; font-weight: 800; color: ${BRAND.blue}; }
  @media (prefers-reduced-motion: reduce) { .lc-other { transition: none; } }
`

/** The street address worth printing: none, or one that only repeats the pool's name. */
function addressOf(loc: Location): string | null {
  const a = (loc.address || '').trim()
  return a && a.toLowerCase() !== loc.name.trim().toLowerCase() ? a : null
}

export default function LocationContent({ location, others, coaches }: {
  location: Location
  others: Location[]
  coaches: string[]
}) {
  const t = useT()
  const locale = useLocale()
  const name = location.name
  const address = addressOf(location)
  // A search for the bare town name is no help finding the pool: offer the
  // map only for a real address or a link the desk set by hand.
  const mapUrl = location.map_url || (address ? locationMapUrl(location) : null)
  // Booking already set to this pool. A signed-out visitor registers first and
  // is carried on there (the home page does the same).
  const { signedIn } = useFamilyStatus()
  const bookTo = '/booking?location=' + encodeURIComponent(location.id)
  const bookHref = signedIn === false ? '/register?next=' + encodeURIComponent(bookTo) : bookTo

  return (
    <BrandRoot>
      <style>{css}</style>

      <header className="b-hero">
        <div className="b-wrap">
          <p className="b-eyebrow">{t('location.eyebrow')}</p>
          <h1>{t('location.title', { name })}</h1>
          {(address || mapUrl) && (
            <p className="lc-addr">
              {address && <span>{address}</span>}
              {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer">{t('location.map')} ↗</a>}
            </p>
          )}
          <p className="b-lead">{t('location.same')}</p>
          <div className="b-ctas">
            <Link className="b-btn gold" href={bookHref}>{t('location.book', { name })} →</Link>
            <Link className="b-btn ghost" href={localePath('/plans', locale)}>{t('adapt.cta.prices')}</Link>
          </div>
        </div>
      </header>

      <section className="b-sec b-paper">
        <div className="b-wrap">
          <div className="b-head">
            <p className="b-eyebrow">{t('page.programs')}</p>
            <h2>{t('location.programs.title', { name })}</h2>
            <p>{t('location.programs.sub')}</p>
          </div>
          <ProgramCards />
          <p className="b-body" style={{ marginTop: 22 }}>{t('home.programs.note')}</p>
        </div>
      </section>

      {coaches.length > 0 && (
        <section className="b-sec">
          <div className="b-wrap">
            <div className="b-head">
              <h2>{t('location.coaches.title', { name })}</h2>
              <p>{t('location.coaches.sub')}</p>
            </div>
            <div className="lc-coaches">
              {coaches.map(c => <span key={c}>{c}</span>)}
            </div>
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className={'b-sec' + (coaches.length > 0 ? ' b-paper' : '')}>
          <div className="b-wrap">
            <div className="b-head">
              <h2>{t('location.others.title')}</h2>
            </div>
            <div className="lc-others">
              {others.map(o => (
                <Link key={o.id} className="b-card lc-other" href={localePath('/locations/' + o.id, locale)}>
                  <h3>{o.name}</h3>
                  {addressOf(o) && <p style={{ margin: 0 }}>{addressOf(o)}</p>}
                  <span className="go">{t('location.others.view', { name: o.name })} →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="b-final">
        <div className="b-wrap">
          <h2>{t('location.final.title', { name })}</h2>
          <p>{t('location.final.body')}</p>
          <div className="b-ctas">
            <Link className="b-btn gold" href={bookHref}>{t('location.book', { name })} →</Link>
          </div>
        </div>
      </section>
    </BrandRoot>
  )
}
