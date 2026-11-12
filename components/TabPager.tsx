'use client'

import dynamic from 'next/dynamic'
import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react'
import { usePathname } from 'next/navigation'
import { appLook } from '@/lib/native-app'
import { createClient } from '@/lib/supabase/client'
import { useFamilyRole } from '@/lib/use-viewer'
import { TabPanelContext, TAB_PATHS, tabOfPath, type TabKey } from '@/lib/tab-panel'
import { reportClientError, isStaleCode, reloadForStaleCode } from '@/lib/report-client-error'
import LoadFailed from '@/components/LoadFailed'

/* The app's five tabs side by side (owner, 2026-11-10, 選項 A): "swiping
   left on 首頁 should slowly show 預約, bit by bit, very smooth, no flicker,
   no jumping". The tabs were five pages loaded one at a time, so the next
   one did not exist until the swipe was over. Here each tab's page is kept
   in its own panel of one sideways scroller that the phone moves itself
   (scroll-snap, like the swimmer cards -- JavaScript never moves it), and
   the other tabs are loaded in the background once the first is up.

   - The address follows the panel on screen (history.replaceState once the
     scroller rests); a tap on the tab bar, or any link or router move to a
     tab, scrolls the pager there at once. A move that carries a query or a
     hash (/booking?student=…, /dashboard/schedule#invites) loads that tab
     afresh, since the pages read those once, when they start.
   - Each panel scrolls up and down by itself (.tp-scroll) and is its own
     containing block, so a page's fixed bars, sheets and dialogs stay in
     its panel and move with it. A panel holding an open sheet or dialog is
     lifted over the app's bars, as the page's own were before.
   - Nothing sideways while a sheet or dialog is open or the keyboard is
     up. Things that already move sideways (the swimmer cards, 我的方案)
     keep the finger (overscroll-behavior-x: contain).
   - Website and every other page: untouched -- this only takes over on a
     tab's own address inside the app. Leaving for another page hides the
     pager (its pages keep their state) and shows that page as before. */

const PAGES: Record<TabKey, ComponentType> = {
  home: dynamic(() => import('@/app/(public)/dashboard/page'), { ssr: false }),
  book: dynamic(() => import('@/app/(public)/booking/page'), { ssr: false }),
  schedule: dynamic(() => import('@/app/(public)/dashboard/page'), { ssr: false }),
  chat: dynamic(() => import('@/app/(public)/dashboard/chat/page'), { ssr: false }),
  me: dynamic(() => import('@/app/(public)/dashboard/me/page'), { ssr: false }),
}
const ORDER: TabKey[] = ['home', 'book', 'schedule', 'chat', 'me']

const noSubscribe = () => () => {}

/* Off (owner, 2026-11-12, 選項 A): on the iPhone, inside the side-by-side
   tabs, 預約 would not scroll up and down and the first swimmer would not
   turn -- three fixes made without an iPhone to try them on did not help.
   The app is back to one page per tab, changed with the tab bar, as before
   2026-11-10. Everything below stays, to switch on again once
   public/_diag/pager-test.html has shown on a phone what the iPhone needs. */
const PAGER_ON = false

export default function TabHost({ children }: { children: React.ReactNode }) {
  const app = useSyncExternalStore(noSubscribe, appLook, () => false)
  const pathname = usePathname() || '/'
  const here = tabOfPath(pathname)
  // Once the pager has been shown it stays mounted (hidden on other pages).
  const [started, setStarted] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (app && here && !started) setStarted(true)
  }, [app, here, started])
  /* Whose pages these are. Signing out drops them (a page left on another
     tab must not show the last family to the next one); another account
     starts them afresh. */
  const [signedOut, setSignedOut] = useState(false)
  const [gen, setGen] = useState(0)
  const lastUid = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!app) return
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_e, session) => {
      const id = session?.user?.id ?? null
      if (lastUid.current && id && lastUid.current !== id) setGen(g => g + 1)
      lastUid.current = id
      setSignedOut(!id)
      if (!id) setStarted(false)
    })
    return () => subscription.unsubscribe()
  }, [app])
  if (!PAGER_ON || !app || (!here && !started) || signedOut) return <>{children}</>
  return (
    <>
      {here ? null : children}
      <Pager key={gen} here={here} />
    </>
  )
}

function Pager({ here }: { here: TabKey | null }) {
  const role = useFamilyRole()
  const pays = role === 'main' || role === 'full'
  // 預約 only for a member who books; while the role is not known yet, only
  // if the app was opened on it.
  const [bootTab] = useState(here)
  const tabs = ORDER.filter(k => k !== 'book' || pays || (role === undefined && bootTab === 'book'))

  const box = useRef<HTMLDivElement>(null)
  const [cur, setCur] = useState<TabKey>(here ?? 'home')
  const curRef = useRef(cur)
  // Kept in step before the other layout effects below read them.
  useLayoutEffect(() => { curRef.current = cur }, [cur])
  const [mounted, setMounted] = useState<Set<TabKey>>(() => new Set(here ? [here] : []))
  const [gen, setGen] = useState<Partial<Record<TabKey, number>>>({})
  const mountedRef = useRef(mounted)
  useLayoutEffect(() => { mountedRef.current = mounted }, [mounted])
  const self = useRef<TabKey | null>(null)
  const tabsRef = useRef(tabs)
  useLayoutEffect(() => { tabsRef.current = tabs })

  const mount = useCallback((k: TabKey) => setMounted(m => (m.has(k) ? m : new Set([...m, k]))), [])
  const jump = useCallback((k: TabKey) => {
    const el = box.current
    const i = tabsRef.current.indexOf(k)
    if (!el || i < 0) return
    const left = i * el.clientWidth
    // Plain scrollLeft: older iPhones refuse scrollTo's behavior 'instant'.
    if (Math.abs(el.scrollLeft - left) > 1) el.scrollLeft = left
  }, [])

  // The pager owns the screen while it is shown: the window does not scroll.
  useLayoutEffect(() => {
    const html = document.documentElement
    if (here) { html.classList.add('msa-pager'); window.scrollTo(0, 0) } else html.classList.remove('msa-pager')
    return () => html.classList.remove('msa-pager')
  }, [here])

  // Each panel's place, kept while the pager is hidden (display: none
  // forgets scroll positions).
  const saved = useRef<Partial<Record<TabKey, number>>>({})
  const wasHere = useRef(here)
  useLayoutEffect(() => {
    const before = wasHere.current
    wasHere.current = here
    const el = box.current
    if (!el) return
    if (before && !here) return
    if (!before && here) {
      for (const p of el.querySelectorAll<HTMLElement>('.tp-panel')) {
        const k = p.dataset.tab as TabKey, y = saved.current[k]
        const s = p.querySelector<HTMLElement>('.tp-scroll')
        if (s && y) s.scrollTop = y
      }
    }
  }, [here])
  const remember = useCallback(() => {
    const el = box.current
    if (!el) return
    for (const p of el.querySelectorAll<HTMLElement>('.tp-panel')) {
      const s = p.querySelector<HTMLElement>('.tp-scroll')
      if (s) saved.current[p.dataset.tab as TabKey] = s.scrollTop
    }
  }, [])
  // Before a link takes the family to another page: note where each panel was.
  useEffect(() => {
    const onClick = () => remember()
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [remember])

  // The address moved: to the tab on screen (ours), or by a tap, a link or
  // the router -- then the pager goes there. With a query or hash the tab
  // starts afresh so it reads them.
  useLayoutEffect(() => {
    if (!here) return
    if (self.current === here) { self.current = null; return }
    const fresh = !!(location.search || location.hash)
    mount(here)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fresh) setGen(g => ({ ...g, [here]: (g[here] || 0) + 1 }))
    setCur(here)
    jump(here)
  }, [here, mount, jump])

  // The list of tabs changed (預約 appears once the role is known): keep
  // the same tab on screen.
  const tabKey = tabs.join(',')
  useLayoutEffect(() => { jump(curRef.current) }, [tabKey, jump])
  // And after a rotation or the keyboard changing the width.
  useEffect(() => {
    const on = () => jump(curRef.current)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [jump])

  // The other tabs load in the background, nearest first, one at a time,
  // once the first one is up -- and only with a plain address, since a page
  // reads its query when it starts (?qr=… belongs to the tab it was sent to).
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const next = () => {
      if (!alive) return
      const list = tabsRef.current
      const at = Math.max(0, list.indexOf(curRef.current))
      const todo = [...list].sort((a, b) => Math.abs(list.indexOf(a) - at) - Math.abs(list.indexOf(b) - at))
      const k = todo.find(t => !mountedRef.current.has(t))
      if (!k) return
      if (location.search || location.hash || !document.documentElement.classList.contains('msa-pager')) { timer = setTimeout(next, 1000); return }
      mount(k)
      timer = setTimeout(next, 500)
    }
    timer = setTimeout(next, 900)
    return () => { alive = false; clearTimeout(timer) }
  }, [mount, tabKey])
  const curMounted = mounted.has(cur)
  /* A panel coming on screen gets its up-and-down scroller made again (its
     place kept). The iPhone decides outside the page what a finger scrolls,
     and a panel drawn in the background, off screen, did not scroll there
     once on screen (owner, 2026-11-10/12: 預約 would not move up or down). */
  useEffect(() => {
    const s = box.current?.querySelector<HTMLElement>(`.tp-panel[data-tab="${cur}"] .tp-scroll`)
    if (!s) return
    let finger = false
    const remake = () => {
      if (finger) return
      const y = s.scrollTop
      s.style.overflowY = 'hidden'
      void s.offsetHeight
      s.style.overflowY = ''
      if (s.scrollTop !== y) s.scrollTop = y
    }
    const id = requestAnimationFrame(remake)
    // And again once its page has grown (its data arrived), unless a finger
    // is on it.
    let t: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(remake, 300) })
    for (const c of s.children) ro.observe(c)
    // Its page may not be drawn yet (it loads on its own): watch what arrives.
    const mo = new MutationObserver(() => { for (const c of s.children) ro.observe(c) })
    mo.observe(s, { childList: true })
    const down = () => { finger = true }
    const up = () => { finger = false }
    s.addEventListener('touchstart', down, { passive: true })
    s.addEventListener('touchend', up, { passive: true })
    s.addEventListener('touchcancel', up, { passive: true })
    return () => {
      cancelAnimationFrame(id); clearTimeout(t); ro.disconnect(); mo.disconnect()
      s.removeEventListener('touchstart', down); s.removeEventListener('touchend', up); s.removeEventListener('touchcancel', up)
    }
  }, [cur, curMounted])

  // The scroller came to rest on a panel: that tab is on screen.
  useEffect(() => {
    const el = box.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = () => {
      const w = el.clientWidth
      if (!w) return
      const i = Math.round(el.scrollLeft / w)
      if (Math.abs(el.scrollLeft - i * w) > 2) return
      const k = tabsRef.current[i]
      if (!k) return
      if (!mountedRef.current.has(k)) mount(k)
      if (k === curRef.current) return
      setCur(k)
      self.current = k
      const path = TAB_PATHS[k]
      // Safari throws past a hundred history writes in a short time; a
      // missed address is better than a broken page.
      if (location.pathname !== path) try { window.history.replaceState(null, '', path) } catch { /* rate-limited */ }
    }
    const onScroll = () => {
      // Anything coming into view is drawn now, if the background has not
      // got to it yet.
      const w = el.clientWidth
      if (w) for (const i of [Math.floor(el.scrollLeft / w), Math.ceil(el.scrollLeft / w)]) {
        const k = tabsRef.current[i]
        if (k && !mountedRef.current.has(k)) mount(k)
      }
      clearTimeout(timer)
      timer = setTimeout(settle, 120)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', settle)
    return () => { clearTimeout(timer); el.removeEventListener('scroll', onScroll); el.removeEventListener('scrollend', settle) }
  }, [mount])

  return (
    <div ref={box} className="tp" hidden={!here}>
      {tabs.map(k => {
        const Page = PAGES[k]
        const on = k === cur
        return (
          // No `inert` on the panels off screen (owner, 2026-11-10: 預約, loaded
          // in the background, would not scroll up and down on the iPhone once
          // it came on screen). iOS works out which part of the screen
          // scrolls apart from the page, and did not take a panel back once
          // its inert was removed; the finger went to the sideways pager.
          // Off screen they cannot be touched anyway; aria-hidden keeps them
          // from screen readers.
          <section key={k} className={'tp-panel' + (on ? ' on' : '')} data-tab={k} aria-hidden={!on}>
            <div className="tp-scroll">
              {mounted.has(k) && (
                <TabPanelContext.Provider value={{ tab: k, active: on && !!here }}>
                  <PanelGuard tab={k} onRetry={() => setGen(g => ({ ...g, [k]: (g[k] || 0) + 1 }))}>
                    <Suspense fallback={null}><Page key={gen[k] || 0} /></Suspense>
                  </PanelGuard>
                </TabPanelContext.Provider>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/* One tab that fails to draw stays one tab: the others and the bars keep
   working, the school is told, and 再試一次 draws it again. Code replaced by
   a new deploy reloads the app by itself. */
class PanelGuard extends Component<{ tab: TabKey; onRetry: () => void; children: React.ReactNode }, { err: unknown }> {
  state = { err: null as unknown }
  static getDerivedStateFromError(err: unknown) { return { err } }
  componentDidCatch(err: unknown) {
    reportClientError(err, 'tab:' + this.props.tab)
    if (isStaleCode(err)) reloadForStaleCode()
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: '24px 16px' }}>
          <LoadFailed onRetry={() => { this.setState({ err: null }); this.props.onRetry() }} />
        </div>
      )
    }
    return this.props.children
  }
}
