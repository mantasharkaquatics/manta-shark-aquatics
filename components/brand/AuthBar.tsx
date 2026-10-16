'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLocale, useSetLocale, useT, rememberExplicitLocale } from '@/lib/i18n/provider'
import { localePath } from '@/lib/i18n/paths'
import { LOCALES, type Locale } from '@/lib/i18n'
import { BRAND, FONT_BODY } from '@/lib/brand'

/* Sign-in and sign-up have no site navigation, so a parent who landed here had
   no obvious way back: the logo on the card does go home, but nothing says so.
   The name sits where the site's bar puts it, in the same face and spacing,
   but in white straight on the page's navy -- no white bar of its own -- and
   it scrolls away with the page. It goes home. (Owner, 2026-09-26.)

   The language switch on the right is the site bar's own (EN / 繁 / 简 in a
   round button, the three languages in a menu), in white on the navy. These
   pages had none (found 2026-10-15), so a Chinese-reading parent who arrived
   on an English phone signed up in English -- the code email, the welcome
   email and the account's saved language with it. */
const LOCALE_SHORT: Record<Locale, string> = { en: 'EN', 'zh-Hant': '繁', 'zh-Hans': '简' }

const css = `
  .ab { position: absolute; top: 12px; left: 12px; right: 12px; z-index: 50; height: 66px; display: flex; align-items: center;
    justify-content: space-between; gap: 12px; padding: 0 28px; font-family: ${FONT_BODY}; }
  .ab a { font-weight: 800; font-size: 16px; letter-spacing: .34em; color: #fff; text-decoration: none; white-space: nowrap; padding: 8px 0;
    transition: color .15s; }
  .ab a:hover { color: ${BRAND.yellow}; }
  .ab a:focus-visible { outline: 2px solid ${BRAND.yellow}; outline-offset: 4px; border-radius: 4px; }
  .ab-pop { position: relative; flex-shrink: 0; }
  .ab-ic { width: 42px; height: 42px; min-height: 0; border-radius: 50%; border: 0; background: rgba(255,255,255,.14); color: #fff;
    display: grid; place-items: center; font-family: inherit; font-weight: 800; font-size: 14px; line-height: 1; cursor: pointer;
    transition: background .15s; }
  .ab-ic:focus-visible, .ab-menu button:focus-visible { outline: 2px solid ${BRAND.yellow}; outline-offset: 2px; }
  .ab-menu { position: absolute; right: 0; top: calc(100% + 10px); min-width: 200px; background: #fff; border-radius: 12px;
    box-shadow: 0 16px 40px rgba(10,22,48,.22); padding: 8px; }
  .ab-menu button { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;
    padding: 10px 12px; border-radius: 8px; border: 0; background: none; text-align: left; font-family: inherit; font-weight: 700;
    font-size: 15px; line-height: 1.3; color: ${BRAND.ink}; cursor: pointer; }
  .ab-menu .on { color: ${BRAND.blue}; }
  .ab-menu .on:focus-visible { outline-color: ${BRAND.blue}; }
  @media (hover: hover) {
    .ab-ic:hover { background: rgba(255,255,255,.24); }
    .ab-menu button:hover { background: #f0f4fa; }
  }
  .auth-shell { padding-top: 110px !important; }
  @media (max-width: 1099px) {
    .ab { top: 8px; left: 8px; right: 8px; height: 60px; padding: 0 18px; }
    .ab a { font-size: 13.5px; letter-spacing: .26em; }
    /* 44px, the phone tap floor, kept round (tap-auto: the global floor would
       stretch it into an oval). */
    .ab-ic { width: 44px; height: 44px; }
    .auth-shell { padding-top: 92px !important; }
  }
`

export default function AuthBar() {
  const locale = useLocale()
  const setLocale = useSetLocale()
  const t = useT()
  const [open, setOpen] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent | TouchEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      btnRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // As the site bar does for a visitor who is not signed in (Navbar
  // changeLocale): the page switches now, and the choice is remembered so the
  // first sign-in keeps it. These pages have no /zh-Hant address to move to.
  function pick(next: Locale) {
    setOpen(false)
    btnRef.current?.focus()
    if (next === locale) return
    setLocale(next)
    rememberExplicitLocale(next)
  }

  return (
    <>
      <style>{css}</style>
      <header className="ab">
        <Link href={localePath('/', locale)}>MANTA SHARK</Link>
        <div className="ab-pop" ref={popRef}>
          <button ref={btnRef} type="button" className="ab-ic tap-auto" aria-label={t('nav.language')} aria-expanded={open}
            onClick={() => setOpen(o => !o)}>
            {LOCALE_SHORT[locale]}
          </button>
          {open && (
            <div className="ab-menu" role="group" aria-label={t('nav.language')}>
              {LOCALES.map(l => (
                <button key={l} type="button" aria-pressed={l === locale} lang={l}
                  className={l === locale ? 'on' : ''} onClick={() => pick(l)}>
                  {t('locale.' + l + '.native')}{l === locale && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
    </>
  )
}
