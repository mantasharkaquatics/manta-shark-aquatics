'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale } from '@/lib/i18n/provider'
import { LOCALES, type Locale } from '@/lib/i18n'
import { appLook, coverViewport, APP_SET_LOCALE_EVENT } from '@/lib/native-app'
import { myFamilyRole } from '@/lib/my-parent'
import { chatIsOpen, onChatStateChange, chatUnread, CHAT_UNREAD_EVENT } from '@/lib/chat-open'
import { BRAND, FONT_BODY } from '@/lib/brand'

/* The phone app's own frame (owner, 2026-10-27): a top bar and five tabs --
   首頁 /dashboard, 預約 /booking, 課表 /dashboard/schedule, 訊息
   /dashboard/chat (the chat, school news and notices), 我的 /dashboard/me.
   Only inside the app (lib/native-app.ts appLook); in a
   browser this renders nothing and the site keeps its own bar and footer.
   What the app hides of the website is in app/globals.css (html.msa-app).

   The tabs are for a signed-in family; a view-only member has no 預約 (they
   cannot book).

   The look (owner, 2026-10-28): the top bar is the website's phone bar -- a
   floating white card with MANTA SHARK and its chevron -- without the book
   button and the menu; a language button sits on the right, and on any page
   that is not a tab a back arrow before the name. It never moves. The tabs
   float as a white capsule above the bottom edge, icons with their names,
   like Instagram's; scrolling down folds the names away and narrows it. */

const noSubscribe = () => () => {}

const TAB_ROOTS = new Set(['/dashboard', '/booking', '/dashboard/schedule', '/dashboard/me'])

/* What the round language button says: the language you are in now (as the
   website bar's, components/Navbar.tsx). */
const LOCALE_SHORT: Record<Locale, string> = { en: 'EN', 'zh-Hant': '繁', 'zh-Hans': '简' }

type Tab = { key: string; href: string; icon: React.ReactNode }

const I = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
)
const ICONS = {
  home: I(<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />),
  book: I(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></>),
  schedule: I(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M7 14h3M7 17h3M13 14h4" /></>),
  chat: I(<path d="M4 5h16v11H9l-5 4z" />),
  me: I(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
}

const css = `
  /* The top bar: the website's floating white card (Navbar .rn-bar, phone size). */
  .msa-ab { position: fixed; top: 8px; left: 8px; right: 8px; z-index: 60; height: 56px; display: flex; align-items: center; gap: 4px;
    padding: 0 8px 0 16px; background: #fff; border-radius: 10px; box-shadow: 0 6px 24px rgba(10,22,48,.16); font-family: ${FONT_BODY}; }
  .msa-ab.sub { padding-left: 4px; }
  .msa-ab-word { flex: 1; min-width: 0; display: inline-flex; align-items: center; font-weight: 800; font-size: 13.5px; letter-spacing: .26em;
    color: ${BRAND.navy}; text-decoration: none; white-space: nowrap; padding: 8px 0; }
  .msa-ab-word svg { width: 9px; height: 12px; margin-left: 8px; flex-shrink: 0; color: ${BRAND.blue}; }
  .msa-ab-back { width: 40px; height: 40px; min-height: 0; border: 0; background: none; color: ${BRAND.navy}; flex-shrink: 0;
    display: grid; place-items: center; cursor: pointer; border-radius: 10px; }
  .msa-ab-lang { position: relative; flex-shrink: 0; }
  .msa-ab-lang > button { width: 40px; height: 40px; min-height: 0; border-radius: 50%; border: 0; background: #eef1f6; color: ${BRAND.navy};
    display: grid; place-items: center; font: inherit; font-weight: 800; font-size: 14px; line-height: 1; cursor: pointer; }
  .msa-ab-menu { position: absolute; right: 0; top: calc(100% + 10px); min-width: 200px; background: #fff; border-radius: 12px;
    box-shadow: 0 16px 40px rgba(10,22,48,.22); padding: 8px; }
  .msa-ab-menu button { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 44px;
    padding: 10px 12px; border-radius: 8px; border: 0; background: none; text-align: left; font: inherit; font-weight: 700; font-size: 15px;
    color: ${BRAND.ink}; cursor: pointer; }
  .msa-ab-menu button[aria-pressed="true"] { color: ${BRAND.blue}; }
  .msa-ab-back:focus-visible, .msa-ab-word:focus-visible, .msa-ab-lang button:focus-visible { outline: 2px solid ${BRAND.blue}; outline-offset: 2px; }

  /* The tabs: a floating white capsule (owner, 2026-10-28, "like Instagram",
     with the names kept). Small while the page is scrolled down, full size
     again on the way up: the names fold away and the capsule narrows. */
  /* Where Instagram puts its own: 22px over the screen's edge on an iPhone,
     over the home-indicator band rather than above it (owner, 2026-10-28,
     comparing the two side by side). 8px where there is no band. */
  .msa-tb { position: fixed; left: 12px; right: 12px; bottom: var(--app-tab-gap); z-index: 60; height: 64px;
    display: flex; align-items: stretch; padding: 6px; border-radius: 32px; font-family: ${FONT_BODY};
    background: rgba(255,255,255,.92); -webkit-backdrop-filter: blur(16px) saturate(1.4); backdrop-filter: blur(16px) saturate(1.4);
    border: 1px solid rgba(227,235,246,.9); box-shadow: 0 8px 28px rgba(10,22,48,.18);
    transition: left .22s ease, right .22s ease, height .22s ease, bottom .22s ease; }
  html.msa-tabs-small .msa-tb { left: 56px; right: 56px; height: 50px; bottom: var(--app-tab-gap); }
  .msa-tb .lb { display: block; max-height: 14px; overflow: hidden; transition: max-height .22s ease, opacity .18s ease; }
  .msa-tb .ic { transition: transform .22s ease; }
  html.msa-tabs-small .msa-tb .lb { max-height: 0; opacity: 0; }
  html.msa-tabs-small .msa-tb .ic { transform: scale(.9); }
  @media (prefers-reduced-motion: reduce) { .msa-tb, .msa-tb .lb, .msa-tb .ic { transition: none; } }
  .msa-tb a { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    border-radius: 26px; padding: 0; font-size: 10.5px; font-weight: 800; color: #7a869b; text-decoration: none;
    cursor: pointer; -webkit-tap-highlight-color: transparent; transition: background .15s; }
  .msa-tb [aria-current="page"] { color: ${BRAND.navy}; background: #e6edf8; }
  .msa-tb a:focus-visible { outline: 2px solid ${BRAND.blue}; outline-offset: -2px; }
  .msa-tb .ic { position: relative; display: block; width: 24px; height: 24px; }
  .msa-tb .bd { position: absolute; top: -4px; right: -9px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 999px;
    background: #e5484d; color: #fff; font-size: 10px; line-height: 16px; text-align: center; font-style: normal; }
`

export default function AppShell() {
  const t = useT()
  const pathname = usePathname() || '/'
  const router = useRouter()
  // The class is on <html> before paint; the server cannot know, so its
  // render (and hydration) says false.
  const app = useSyncExternalStore(noSubscribe, appLook, () => false)
  const [signedIn, setSignedIn] = useState(false)
  const [viewer, setViewer] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const locale = useLocale()
  const [langOpen, setLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)
  const langBtnRef = useRef<HTMLButtonElement>(null)

  // The language menu closes on a tap elsewhere, on Escape and on a new page.
  useEffect(() => {
    if (!langOpen) return
    const onDown = (e: PointerEvent) => { if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setLangOpen(false); langBtnRef.current?.focus() } }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [langOpen])
  useEffect(() => { const id = setTimeout(() => setLangOpen(false), 0); return () => clearTimeout(id) }, [pathname])

  /* The website bar (components/Navbar) stays mounted, hidden, inside the
     app and already knows how to change the language -- the main account's
     saved language, a guardian's choice kept on the phone, the localised
     address. It is asked to, rather than copied. */
  const pickLocale = (l: Locale) => {
    setLangOpen(false)
    window.dispatchEvent(new CustomEvent(APP_SET_LOCALE_EVENT, { detail: l }))
  }

  useEffect(() => {
    if (!app) return
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session)
      // Not inside this callback: Supabase warns it can deadlock.
      if (session) setTimeout(() => { myFamilyRole(supabase).then(r => setViewer(r === 'viewer')).catch(() => {}) }, 0)
      else setViewer(false)
    })
    const sync = () => { setChatOpen(chatIsOpen()); setUnread(chatUnread()) }
    sync()
    const off = onChatStateChange(sync)
    window.addEventListener(CHAT_UNREAD_EVENT, sync)
    return () => { subscription.unsubscribe(); off(); window.removeEventListener(CHAT_UNREAD_EVENT, sync) }
  }, [app])

  /* Down a little: small. Up a little, or back near the top: full size.
     A few pixels either way are ignored, so a resting thumb does not make
     the bar flicker. Left on <html> (msa-tabs-small) so the booking page's
     bottom bar follows it (app/globals.css). */
  useEffect(() => {
    if (!app) return
    const root = document.documentElement
    let last = window.scrollY
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        const y = window.scrollY
        const dy = y - last
        if (y < 40) root.classList.remove('msa-tabs-small')
        else if (dy > 8) root.classList.add('msa-tabs-small')
        else if (dy < -8) root.classList.remove('msa-tabs-small')
        if (Math.abs(dy) > 8 || y < 40) last = y
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); root.classList.remove('msa-tabs-small') }
  }, [app])
  // A new page starts with the bar at full size -- and, should a page change
  // have rewritten the viewport tag, still covering the whole screen.
  useEffect(() => {
    document.documentElement.classList.remove('msa-tabs-small')
    if (app) coverViewport()
  }, [pathname, app])

  // The message screen fills the screen with its own header and tabs.
  if (!app || pathname === '/dashboard/chat') return null

  const isRoot = TAB_ROOTS.has(pathname)
  const back = () => {
    if (window.history.length > 1) router.back()
    else router.push('/dashboard')
  }

  const tabs: Tab[] = [
    { key: 'home', href: '/dashboard', icon: ICONS.home },
    ...(viewer ? [] : [{ key: 'book', href: '/booking', icon: ICONS.book }]),
    { key: 'schedule', href: '/dashboard/schedule', icon: ICONS.schedule },
    { key: 'chat', href: '/dashboard/chat', icon: ICONS.chat },
    { key: 'me', href: '/dashboard/me', icon: ICONS.me },
  ]
  // 我的 also covers the pages it opens; 首頁 is the dashboard itself.
  const onTab = (k: string) => {
    if (chatOpen || pathname === '/dashboard/chat') return k === 'chat'
    if (k === 'home') return pathname === '/dashboard'
    if (k === 'book') return pathname.startsWith('/booking')
    if (k === 'schedule') return pathname === '/dashboard/schedule'
    if (k === 'me') return pathname === '/dashboard/me' || pathname === '/dashboard/account' || pathname === '/dashboard/partnerships'
    return false
  }

  return (
    <>
      <style>{css}</style>
      <header className={'msa-ab' + (isRoot ? '' : ' sub')}>
        {!isRoot && (
          <button type="button" className="msa-ab-back" onClick={back} aria-label={t('app.back')}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
        )}
        <Link href="/dashboard" className="msa-ab-word">
          MANTA SHARK
          <svg viewBox="0 0 12 14" aria-hidden="true">
            <path d="M2.5 1.5 L9 7 L2.5 12.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <div className="msa-ab-lang" ref={langRef}>
          <button ref={langBtnRef} type="button" className="tap-auto" aria-label={t('nav.language')} aria-expanded={langOpen}
            onClick={() => setLangOpen(o => !o)}>
            {LOCALE_SHORT[locale]}
          </button>
          {langOpen && (
            <div className="msa-ab-menu" role="group" aria-label={t('nav.language')}>
              {LOCALES.map(l => (
                <button key={l} type="button" aria-pressed={l === locale} onClick={() => pickLocale(l)}>
                  {t('locale.' + l + '.native')}{l === locale && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      {signedIn && (
        <nav className="msa-tb" aria-label={t('app.tabs')}>
          {tabs.map(tab => {
            const label = t('app.tab.' + tab.key)
            const current = onTab(tab.key) ? 'page' as const : undefined
            const inner = (
              <>
                <span className="ic">{tab.icon}{tab.key === 'chat' && unread > 0 && <i className="bd" aria-hidden="true">{unread > 9 ? '9+' : unread}</i>}</span>
                <span className="lb">{label}</span>
              </>
            )
            return (
              <Link key={tab.key} href={tab.href} aria-current={current}
                aria-label={tab.key === 'chat' && unread > 0 ? `${label} · ${t('chat.unread', { n: unread })}` : undefined}>{inner}</Link>
            )
          })}
        </nav>
      )}
    </>
  )
}
