'use client'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale, useSetLocale, rememberExplicitLocale, readExplicitLocale, clearExplicitLocale } from '@/lib/i18n/provider'
import { LOCALES, isLocale, type Locale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/paths'
import { BRAND } from '@/lib/brand'

/* The Rivian-style bar the owner picked (2026-09-26): a white bar floating a few
   pixels inside the window, the name set as a wordmark instead of the round logo,
   the links in the middle, and on the right the one amber action plus two round
   buttons -- language and account.

   It is fixed, so the page scrolls underneath it. Pages that open on a dark hero
   slide that hero up under the bar (BrandStyles pulls .b-hero up by
   --nav-space); every other page gets the navy spacer rendered below, so its
   content starts where it always did. Scrolling down tucks the bar away and
   scrolling up brings it back, so on a phone it never sits over what you are
   reading. Terms & Policies moved into the account menu and the footer: the
   middle holds only the five pages a new parent is choosing between. */

const navLinks = [
  { labelKey: 'page.assessment', href: '/assessment' },
  { labelKey: 'page.levels', href: '/levels' },
  { labelKey: 'page.plans', href: '/plans' },
  { labelKey: 'page.about', href: '/about' },
  { labelKey: 'page.faq', href: '/faq' },
]

/* What the round language button says: the language you are in now. */
const LOCALE_SHORT: Record<Locale, string> = { en: 'EN', 'zh-Hant': '繁', 'zh-Hans': '简' }

const css = `
  /* --nav-space: the room a page leaves at its top for the bar.
     --nav-cover: how far down the bar reaches right now -- sticky things on a
     page (the levels and FAQ side menus, the booking week header) sit below it,
     and move up when the bar tucks away. */
  :root { --nav-space: 80px; --nav-cover: 76px; }
  @media (max-width: 1023px) { :root { --nav-space: 68px; --nav-cover: 70px; } }
  :root[data-nav-tucked] { --nav-cover: 8px; }

  .rn-space { height: var(--nav-space); background: ${BRAND.navy}; }
  .rn { position: fixed; top: 12px; left: 12px; right: 12px; z-index: 50; transition: transform .28s ease; }
  .rn.tuck { transform: translateY(calc(-100% - 48px)); }
  .rn-bar { height: 56px; background: #fff; border-radius: 10px; box-shadow: 0 6px 24px rgba(10,22,48,.16);
    display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; padding: 0 12px 0 28px; }
  .rn-word { justify-self: start; font-weight: 800; font-size: 15px; letter-spacing: .34em; color: ${BRAND.navy};
    text-decoration: none; white-space: nowrap; padding: 8px 0; }
  .rn-links { display: flex; gap: 6px; }
  .rn-links a { font-size: 14.5px; font-weight: 700; color: ${BRAND.ink}; text-decoration: none; padding: 8px 12px;
    border-radius: 8px; transition: background .15s, color .15s; }
  .rn-links a:hover { background: #eef3fa; }
  .rn-links a[aria-current="page"] { color: ${BRAND.blue}; box-shadow: inset 0 -2px 0 ${BRAND.blue}; border-radius: 0; }
  .rn-right { justify-self: end; display: flex; align-items: center; gap: 8px; }
  .rn-cta { display: inline-flex; align-items: center; height: 38px; padding: 0 18px; border-radius: 999px;
    background: ${BRAND.amber}; color: ${BRAND.navy}; font-weight: 800; font-size: 14.5px; text-decoration: none; white-space: nowrap;
    transition: background .15s; }
  .rn-cta:hover { background: ${BRAND.amberHover}; }
  .rn-ic { width: 40px; height: 40px; border-radius: 50%; border: 0; background: #eef1f6; color: ${BRAND.navy};
    display: grid; place-items: center; font-family: inherit; font-weight: 800; font-size: 14px; line-height: 1; cursor: pointer; transition: background .15s; }
  .rn-ic:hover { background: #e2e8f1; }
  .rn-ic.me { background: ${BRAND.navy}; color: #fff; }
  .rn-ic.me:hover { background: #1d3f7c; }
  .rn-ic:focus-visible, .rn-cta:focus-visible, .rn-links a:focus-visible, .rn-word:focus-visible, .rn-menu a:focus-visible,
  .rn-menu button:focus-visible { outline: 2px solid ${BRAND.blue}; outline-offset: 2px; }
  .rn-pop { position: relative; }
  .rn-menu { position: absolute; right: 0; top: calc(100% + 10px); min-width: 220px; background: #fff; border-radius: 12px;
    box-shadow: 0 16px 40px rgba(10,22,48,.22); padding: 8px; }
  .rn-menu .who { font-size: 12.5px; font-weight: 700; color: ${BRAND.mute}; padding: 8px 12px 6px; }
  .rn-menu a, .rn-menu button { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;
    padding: 10px 12px; border-radius: 8px; border: 0; background: none; text-align: left; font-family: inherit; font-weight: 700; font-size: 15px; line-height: 1.3;
    color: ${BRAND.ink}; text-decoration: none; cursor: pointer; }
  .rn-menu a:hover, .rn-menu button:hover { background: #f0f4fa; }
  .rn-menu .out { color: #c0392b; }
  .rn-menu .on { color: ${BRAND.blue}; }
  .rn-menu hr { border: 0; border-top: 1px solid ${BRAND.line}; margin: 6px 4px; }
  .rn-burger { display: none; }
  .rn-drawer { display: none; }

  @media (max-width: 1023px) {
    .rn { top: 8px; left: 8px; right: 8px; }
    .rn-bar { grid-template-columns: 1fr auto; padding: 0 8px 0 18px; }
    .rn-links, .rn-right .rn-pop { display: none; }
    .rn-word { font-size: 13.5px; letter-spacing: .26em; }
    .rn-cta { height: 36px; padding: 0 14px; font-size: 14px; }
    .rn-burger { display: grid; }
    .rn-scrim { position: fixed; inset: 0; background: rgba(10,22,48,.45); z-index: -1; }
    .rn-drawer { display: block; margin-top: 8px; background: #fff; border-radius: 12px; box-shadow: 0 16px 40px rgba(10,22,48,.25);
      padding: 6px 12px; max-height: calc(100dvh - 90px); overflow-y: auto; }
    .rn-drawer a, .rn-drawer button.row { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%;
      min-height: 52px; border: 0; border-bottom: 1px solid ${BRAND.line}; background: none; padding: 0 10px; text-align: left;
      font-family: inherit; font-weight: 700; font-size: 16px; line-height: 1.3; color: ${BRAND.ink}; text-decoration: none; cursor: pointer; }
    .rn-drawer a[aria-current="page"] { color: ${BRAND.blue}; }
    .rn-drawer button.out { color: #c0392b; border-bottom: 0; }
    .rn-drawer .lang { display: flex; gap: 8px; padding: 4px 10px 12px; border-bottom: 1px solid ${BRAND.line}; }
    .rn-drawer .lang button { flex: 1; min-height: 44px; border-radius: 10px; border: 1.5px solid ${BRAND.line}; background: #fff;
      font-family: inherit; font-weight: 700; font-size: 15px; line-height: 1; color: ${BRAND.ink}; cursor: pointer; }
    .rn-drawer .lang button[aria-pressed="true"] { border-color: ${BRAND.navy}; background: ${BRAND.navy}; color: #fff; }
    .rn-drawer .sub { font-size: 12.5px; font-weight: 700; color: ${BRAND.mute}; padding: 12px 10px 8px; }
  }
  @media (max-width: 380px) {
    .rn-word { letter-spacing: .18em; }
  }
  @media (prefers-reduced-motion: reduce) { .rn { transition: none; } }
`

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={{ color: '#9aa6ba', flexShrink: 0 }} aria-hidden="true">
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  )
}

export default function Navbar() {
  const [open, setOpen] = useState<null | 'lang' | 'acct' | 'drawer'>(null)
  const [tucked, setTucked] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [firstName, setFirstName] = useState('')
  const [fullName, setFullName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const t = useT()
  const locale = useLocale()
  const setLocale = useSetLocale()
  const navRef = useRef<HTMLElement>(null)

  useEffect(() => {
    async function applyUser(userId: string | undefined) {
      if (!userId) { setIsLoggedIn(false); setFirstName(''); setFullName(''); return }
      setIsLoggedIn(true)
      const { data: parent } = await supabase
        .from('parents')
        .select('id, first_name, last_name, preferred_language')
        .eq('auth_user_id', userId)
        .single()
      if (!parent) return
      setFirstName(parent.first_name)
      setFullName(`${parent.first_name} ${parent.last_name || ''}`.trim())
      setParentId(parent.id)
      const chosen = readExplicitLocale()
      if (chosen) {
        setLocale(chosen)
        clearExplicitLocale()
        await supabase.from('parents').update({ preferred_language: chosen }).eq('id', parent.id)
      } else if (isLocale(parent.preferred_language)) {
        setLocale(parent.preferred_language)
      }
    }
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      await applyUser(user?.id)
      setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user?.id)
    })
    return () => subscription.unsubscribe()
  }, [pathname])

  // Any navigation closes whatever was open.
  useEffect(() => { setOpen(null) }, [pathname])

  // A click anywhere else, or Escape, closes a menu.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  // Tuck the bar away while scrolling down, bring it back on the way up.
  useEffect(() => {
    let last = window.scrollY
    function onScroll() {
      const y = window.scrollY
      if (y < 120) setTucked(false)
      else if (y > last + 6) setTucked(true)
      else if (y < last - 6) setTucked(false)
      last = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const hidden = tucked && !open
  useEffect(() => {
    const root = document.documentElement
    if (hidden) root.setAttribute('data-nav-tucked', '')
    else root.removeAttribute('data-nav-tucked')
  }, [hidden])

  async function changeLocale(next: Locale) {
    setOpen(null)
    setLocale(next)
    goToLocalisedUrl(next)
    if (!isLoggedIn || !parentId) { rememberExplicitLocale(next); return }
    clearExplicitLocale()
    const { error } = await supabase.from('parents').update({ preferred_language: next }).eq('id', parentId)
    if (error) console.error('[i18n] failed to save preferred_language', error)
  }

  /* On /zh-Hant/... the locale comes from the URL segment, and the layout hands
     it to the provider as a fixed prop -- which beats anything the switcher puts
     in state or in the cookie. So the switcher has to move the visitor, in both
     directions, so the address bar and the words on the page never disagree.
     Pages with no localised route stay where they are (localePath returns them
     unchanged) and the cookie drives those. */
  function goToLocalisedUrl(next: Locale) {
    const seg = pathname.split('/')[1] || ''
    const bare = isLocale(seg) && seg !== 'en' ? pathname.slice(seg.length + 1) || '/' : pathname
    const target = localePath(bare, next)
    if (target !== pathname) router.push(target)
  }

  async function handleSignOut() {
    setOpen(null)
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setFirstName('')
    setFullName('')
    router.push('/')
  }

  const bare = (() => {
    const seg = pathname.split('/')[1] || ''
    return isLocale(seg) && seg !== 'en' ? pathname.slice(seg.length + 1) || '/' : pathname
  })()
  const current = (href: string) => (bare === href ? 'page' as const : undefined)
  const toggle = (which: 'lang' | 'acct' | 'drawer') => setOpen(o => (o === which ? null : which))

  const cta = authLoading ? null : isLoggedIn ? (
    <Link href="/booking" className="rn-cta">
      <span className="rn-full">{t('quick.book')}</span>
    </Link>
  ) : (
    <Link href="/register" className="rn-cta">{t('nav.createAccount')}</Link>
  )

  return (
    <>
      <style>{css}</style>
      <div className="rn-space" aria-hidden="true" />
      <nav ref={navRef} className={`rn${hidden ? ' tuck' : ''}`} aria-label="Main">
        {open === 'drawer' && <div className="rn-scrim" onClick={() => setOpen(null)} />}
        <div className="rn-bar">
          <Link href={localePath('/', locale)} className="rn-word">MANTA SHARK</Link>

          <div className="rn-links">
            {navLinks.map(link => (
              <Link key={link.href} href={localePath(link.href, locale)} aria-current={current(link.href)}>
                {t(link.labelKey)}
              </Link>
            ))}
          </div>

          <div className="rn-right">
            {cta}

            <div className="rn-pop">
              <button type="button" className="rn-ic" aria-label={t('nav.language')} aria-expanded={open === 'lang'}
                onClick={() => toggle('lang')}>
                {LOCALE_SHORT[locale]}
              </button>
              {open === 'lang' && (
                <div className="rn-menu" role="menu">
                  {LOCALES.map(l => (
                    <button key={l} type="button" role="menuitemradio" aria-checked={l === locale}
                      className={l === locale ? 'on' : ''} onClick={() => changeLocale(l)}>
                      {t('locale.' + l + '.native')}{l === locale && <span aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="rn-pop">
              <button type="button" className={`rn-ic${isLoggedIn ? ' me' : ''}`} aria-label={t('nav.account')}
                aria-expanded={open === 'acct'} onClick={() => toggle('acct')}>
                {authLoading ? null : isLoggedIn && firstName ? firstName.charAt(0).toUpperCase() : <PersonIcon />}
              </button>
              {open === 'acct' && (
                <div className="rn-menu" role="menu">
                  {isLoggedIn ? (
                    <>
                      {fullName && <div className="who">{fullName}</div>}
                      <Link href="/dashboard" role="menuitem">{t('nav.myPage')}</Link>
                      <Link href="/dashboard/account" role="menuitem">{t('nav.dashboard')}</Link>
                      <Link href="/dashboard/partnerships" role="menuitem">{t('quick.partnerships')}</Link>
                      <Link href="/policies" role="menuitem">{t('page.policies')}</Link>
                      <hr />
                      <button type="button" role="menuitem" className="out" onClick={handleSignOut}>{t('nav.signOut')}</button>
                    </>
                  ) : (
                    <>
                      <Link href="/login" role="menuitem">{t('nav.signIn')}</Link>
                      <Link href="/register" role="menuitem">{t('nav.createAccount')}</Link>
                      <hr />
                      <Link href="/policies" role="menuitem">{t('page.policies')}</Link>
                    </>
                  )}
                </div>
              )}
            </div>

            <button type="button" className="rn-ic rn-burger" aria-label={t('nav.menu')} aria-expanded={open === 'drawer'}
              onClick={() => toggle('drawer')}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" aria-hidden="true">
                {open === 'drawer' ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {open === 'drawer' && (
          <div className="rn-drawer">
            {isLoggedIn && (
              <Link href="/dashboard" aria-current={current('/dashboard')}>
                <span>{t('nav.myPage')}</span><Chevron />
              </Link>
            )}
            {navLinks.map(link => (
              <Link key={link.href} href={localePath(link.href, locale)} aria-current={current(link.href)}>
                <span>{t(link.labelKey)}</span><Chevron />
              </Link>
            ))}
            {isLoggedIn ? (
              <>
                <Link href="/dashboard/account"><span>{t('nav.dashboard')}</span><Chevron /></Link>
                <Link href="/dashboard/partnerships"><span>{t('quick.partnerships')}</span><Chevron /></Link>
              </>
            ) : (
              <Link href="/login"><span>{t('nav.signIn')}</span><Chevron /></Link>
            )}
            <Link href="/policies"><span>{t('page.policies')}</span><Chevron /></Link>
            {/* Language as three side-by-side buttons: always visible, but each is
                a deliberate target rather than a row a scrolling thumb can catch. */}
            <div className="sub">{t('nav.language')}</div>
            <div className="lang">
              {LOCALES.map(l => (
                <button key={l} type="button" aria-pressed={l === locale} onClick={() => changeLocale(l)}>
                  {t('locale.' + l + '.native')}
                </button>
              ))}
            </div>
            {isLoggedIn && (
              <button type="button" className="row out" onClick={handleSignOut}>{t('nav.signOut')}</button>
            )}
          </div>
        )}
      </nav>
    </>
  )
}
