'use client'
import Link from 'next/link'
import { useLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { BRAND, FONT_BODY } from '@/lib/brand'

/* Sign-in and sign-up have no site navigation, so a parent who landed here had
   no obvious way back: the logo on the card does go home, but nothing says so.
   The name sits where the site's bar puts it, in the same face and spacing,
   but in white straight on the page's navy -- no white bar of its own -- and
   it scrolls away with the page. It goes home. (Owner, 2026-09-26.) */
const css = `
  .ab { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 50; height: 66px; display: flex; align-items: center;
    padding: 0 28px; font-family: ${FONT_BODY}; }
  .ab a { font-weight: 800; font-size: 16px; letter-spacing: .34em; color: #fff; text-decoration: none; white-space: nowrap; padding: 8px 0;
    transition: color .15s; }
  .ab a:hover { color: ${BRAND.yellow}; }
  .ab a:focus-visible { outline: 2px solid ${BRAND.yellow}; outline-offset: 4px; border-radius: 4px; }
  .auth-shell { padding-top: 110px !important; }
  @media (max-width: 1023px) {
    .ab { top: 8px; left: 8px; right: 8px; height: 60px; padding: 0 18px; }
    .ab a { font-size: 13.5px; letter-spacing: .26em; }
    .auth-shell { padding-top: 92px !important; }
  }
`

export default function AuthBar() {
  const locale = useLocale()
  return (
    <>
      <style>{css}</style>
      <header className="ab">
        <Link href={localePath('/', locale)}>MANTA SHARK</Link>
      </header>
    </>
  )
}
