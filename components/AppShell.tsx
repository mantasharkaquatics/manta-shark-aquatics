'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/provider'
import { appLook } from '@/lib/native-app'
import { myFamilyRole } from '@/lib/my-parent'
import { openChat, chatIsOpen, onChatStateChange, chatUnread, CHAT_UNREAD_EVENT } from '@/lib/chat-open'
import { BRAND, FONT_BODY } from '@/lib/brand'

/* The phone app's own frame (owner, 2026-10-27): a top bar and five tabs --
   首頁 /dashboard, 預約 /booking, 課表 /dashboard/schedule, 訊息 (the chat),
   我的 /dashboard/me. Only inside the app (lib/native-app.ts appLook); in a
   browser this renders nothing and the site keeps its own bar and footer.
   What the app hides of the website is in app/globals.css (html.msa-app).

   The tabs are for a signed-in family; a view-only member has no 預約 (they
   cannot book). The top bar names the tab, or offers a way back on any other
   page (the account page, the programs page opened from 我的). */

const noSubscribe = () => () => {}

const TAB_ROOTS: Record<string, string> = {
  '/dashboard': '',
  '/booking': 'app.tab.book',
  '/dashboard/schedule': 'app.tab.schedule',
  '/dashboard/me': 'app.tab.me',
}

type Tab = { key: string; href?: string; icon: React.ReactNode }

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
  .msa-ab { position: fixed; top: 0; left: 0; right: 0; z-index: 60; height: var(--app-bar-h); display: flex; align-items: center; gap: 10px;
    padding: 0 14px; background: #fff; border-bottom: 1px solid ${BRAND.line}; font-family: ${FONT_BODY}; }
  .msa-ab img { width: 30px; height: auto; display: block; }
  .msa-ab b { font-size: 17px; font-weight: 800; color: ${BRAND.navy}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .msa-ab-back { width: 40px; height: 40px; min-height: 0; margin-left: -8px; border: 0; background: none; color: ${BRAND.navy};
    display: grid; place-items: center; cursor: pointer; border-radius: 10px; }
  .msa-ab-back:focus-visible { outline: 2px solid ${BRAND.blue}; }
  .msa-tb { position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; height: var(--app-tab-h); display: flex;
    background: rgba(255,255,255,.97); border-top: 1px solid ${BRAND.line}; font-family: ${FONT_BODY}; }
  .msa-tb a, .msa-tb button { flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    border: 0; background: none; padding: 0; font: inherit; font-size: 11px; font-weight: 800; color: #8a94a6; text-decoration: none;
    cursor: pointer; -webkit-tap-highlight-color: transparent; }
  .msa-tb [aria-current="page"] { color: ${BRAND.navy}; }
  .msa-tb [aria-current="page"] svg { stroke: ${BRAND.amberHover}; }
  .msa-tb a:focus-visible, .msa-tb button:focus-visible { outline: 2px solid ${BRAND.blue}; outline-offset: -4px; border-radius: 10px; }
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

  if (!app) return null

  const isRoot = pathname in TAB_ROOTS
  const title = isRoot && TAB_ROOTS[pathname] ? t(TAB_ROOTS[pathname]) : 'Manta Shark'
  const back = () => {
    if (window.history.length > 1) router.back()
    else router.push('/dashboard')
  }

  const tabs: Tab[] = [
    { key: 'home', href: '/dashboard', icon: ICONS.home },
    ...(viewer ? [] : [{ key: 'book', href: '/booking', icon: ICONS.book }]),
    { key: 'schedule', href: '/dashboard/schedule', icon: ICONS.schedule },
    { key: 'chat', icon: ICONS.chat },
    { key: 'me', href: '/dashboard/me', icon: ICONS.me },
  ]
  // 我的 also covers the pages it opens; 首頁 is the dashboard itself.
  const onTab = (k: string) => {
    if (chatOpen) return k === 'chat'
    if (k === 'home') return pathname === '/dashboard'
    if (k === 'book') return pathname.startsWith('/booking')
    if (k === 'schedule') return pathname === '/dashboard/schedule'
    if (k === 'me') return pathname === '/dashboard/me' || pathname === '/dashboard/account' || pathname === '/dashboard/partnerships'
    return false
  }

  return (
    <>
      <style>{css}</style>
      <header className="msa-ab">
        {isRoot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/mascot.png" alt="" />
        ) : (
          <button type="button" className="msa-ab-back" onClick={back} aria-label={t('app.back')}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
        )}
        <b>{title}</b>
      </header>
      {signedIn && (
        <nav className="msa-tb" aria-label={t('app.tabs')}>
          {tabs.map(tab => {
            const label = t('app.tab.' + tab.key)
            const current = onTab(tab.key) ? 'page' as const : undefined
            const inner = (
              <>
                <span className="ic">{tab.icon}{tab.key === 'chat' && unread > 0 && <i className="bd" aria-hidden="true">{unread > 9 ? '9+' : unread}</i>}</span>
                {label}
              </>
            )
            return tab.href ? (
              <Link key={tab.key} href={tab.href} aria-current={current}>{inner}</Link>
            ) : (
              <button key={tab.key} type="button" aria-current={current} onClick={() => openChat()}
                aria-label={unread > 0 ? `${label} · ${t('chat.unread', { n: unread })}` : label}>{inner}</button>
            )
          })}
        </nav>
      )}
    </>
  )
}
