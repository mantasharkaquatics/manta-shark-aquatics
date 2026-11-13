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

/* The app's five tabs, and a finger that moves between them (owner,
   2026-11-10, 選項 A, and again 2026-11-13: "like one page, swiping left
   and right -- find a way"). Every tab's page is kept, drawn, and a
   sideways swipe slides the page on screen away while the page beside it,
   the real one, slides in under the finger. No loading, nothing pictured.

   How, after two ways that failed on the iPhone (2026-11-10..13):
   - The tab on screen is an ordinary page: it is in the document and the
     window scrolls it, exactly as before the tabs were side by side. So
     scrolling, the swimmer, the cards and every sheet work as they always
     did -- the first attempt put each page in its own up-and-down scroller
     inside a sideways one, and on the iPhone 預約 then would not scroll and
     the first swimmer would not turn.
   - The other tabs wait, drawn, as fixed sheets the size of the screen
     (.ts-layer, hidden), each showing its page where it was left.
   - A clearly sideways drag (not one that starts on something that moves
     sideways itself -- the swimmer cards, 我的方案 -- nor on the swimmer,
     a field, or with a sheet or the keyboard up) turns the page on screen
     into such a sheet too, at the same place, and the finger moves the
     sheets; nothing else is drawn while it does. Let go past a quarter of
     the screen, or with a flick, and the tab beside it is on screen: it
     goes back into the document and the window is put where it was left.
     The second attempt pictured the next tab natively and loaded it after.
   - The address follows (history.replaceState); a tap on the tab bar, a
     link or a router move to a tab switches at once. A move with a query or
     a hash (/booking?student=…, #invites) starts that tab afresh, as the
     pages read those once.
   - Website and every other page: untouched; the tabs wait hidden. */

const PAGES: Record<TabKey, ComponentType> = {
  home: dynamic(() => import('@/app/(public)/dashboard/page'), { ssr: false }),
  book: dynamic(() => import('@/app/(public)/booking/page'), { ssr: false }),
  schedule: dynamic(() => import('@/app/(public)/dashboard/page'), { ssr: false }),
  chat: dynamic(() => import('@/app/(public)/dashboard/chat/page'), { ssr: false }),
  me: dynamic(() => import('@/app/(public)/dashboard/me/page'), { ssr: false }),
}
const ORDER: TabKey[] = ['home', 'book', 'schedule', 'chat', 'me']
/** Where a sideways drag may not start: things that take the finger
    themselves. Anything scrolling sideways is found as well. */
const OWN_FINGER = '.sw-hold, input, textarea, select, [contenteditable="true"], [data-no-tab-swipe]'
/** Something open over the page (the same list globals.css uses). */
const OPEN = '.msa-sheet-back, .msa-dlg-back, .mst-back, .msa-lsheet-wrap, .pc-view, .sw-scrim.on, [aria-modal="true"]:not([aria-hidden="true"])'
/** Past this part of the screen, or this fast (px/ms), the swipe goes through. */
const GO_PART = 0.25
const GO_SPEED = 0.45
const SLIDE = 'transform 280ms cubic-bezier(.2,.8,.25,1)'

const noSubscribe = () => () => {}

export default function TabHost({ children }: { children: React.ReactNode }) {
  const app = useSyncExternalStore(noSubscribe, appLook, () => false)
  const pathname = usePathname() || '/'
  const here = tabOfPath(pathname)
  // Once shown, the tabs stay (hidden on other pages).
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
  if (!app || (!here && !started) || signedOut) return <>{children}</>
  return (
    <>
      {here ? null : children}
      <Stage key={gen} here={here} />
    </>
  )
}

type Swipe = { x0: number; y0: number; dx: number; dir: 'h' | 'v' | null; t: number[]; xs: number[]; y: number; prev: TabKey | null; next: TabKey | null }

function Stage({ here }: { here: TabKey | null }) {
  const role = useFamilyRole()
  const pays = role === 'main' || role === 'full'
  // 預約 only for a member who books; while the role is not known yet, only
  // if the app was opened on it.
  const [bootTab] = useState(here)
  const tabs = ORDER.filter(k => k !== 'book' || pays || (role === undefined && bootTab === 'book'))

  const box = useRef<HTMLDivElement>(null)
  const [cur, setCur] = useState<TabKey>(here ?? 'home')
  const curRef = useRef(cur)
  const [mounted, setMounted] = useState<Set<TabKey>>(() => new Set(here ? [here] : []))
  const [gen, setGen] = useState<Partial<Record<TabKey, number>>>({})
  const mountedRef = useRef(mounted)
  useLayoutEffect(() => { mountedRef.current = mounted }, [mounted])
  const self = useRef<TabKey | null>(null)
  const tabsRef = useRef(tabs)
  useLayoutEffect(() => { tabsRef.current = tabs })
  const hereRef = useRef(here)
  useLayoutEffect(() => { hereRef.current = here }, [here])
  const mount = useCallback((k: TabKey) => setMounted(m => (m.has(k) ? m : new Set([...m, k]))), [])

  /* ---------- where each page is ---------- */
  // Where each tab was left (the window's scroll while it was on screen).
  const saved = useRef<Partial<Record<TabKey, number>>>({})
  // The window's place for the tab on screen, kept up to date.
  const liveY = useRef(0)
  // Where the pages start in the document (under the top bar's room).
  const top = useRef(0)
  // The window's place to put back once the tab on screen is laid out.
  const pendingY = useRef<number | null>(null)
  const swipe = useRef<Swipe | null>(null)
  const sliding = useRef(false)

  const panel = useCallback((k: TabKey) => box.current?.querySelector<HTMLElement>(`.ts-p[data-tab="${k}"]`) ?? null, [])

  /** The tab on screen: an ordinary page in the document. */
  const toFlow = useCallback((p: HTMLElement) => {
    p.classList.remove('ts-layer', 'ts-off', 'ts-move')
    p.style.transform = ''
    p.style.transition = ''
    const i = p.firstElementChild as HTMLElement | null
    if (i) i.style.top = ''
  }, [])
  /** A waiting tab (or, while swiped, a moving one): a sheet the size of the
      screen showing its page where it was left, `x` across. */
  const toLayer = useCallback((p: HTMLElement, k: TabKey, x: number, shown: boolean) => {
    p.classList.add('ts-layer')
    p.classList.toggle('ts-off', !shown)
    p.style.transform = `translate3d(${x}px,0,0)`
    const i = p.firstElementChild as HTMLElement | null
    // Moved with top, not a transform: a transform here would become the
    // frame for the page's fixed bars instead of the screen-sized sheet.
    if (i) i.style.top = `${top.current - (saved.current[k] || 0)}px`
  }, [])
  /** Every page as it should be at rest. */
  const settle = useCallback(() => {
    if (swipe.current || sliding.current) return
    const c = curRef.current
    const list = tabsRef.current
    const w = window.innerWidth
    const ci = list.indexOf(c)
    const cp = panel(c)
    if (cp && hereRef.current) {
      toFlow(cp)
      const r = box.current?.getBoundingClientRect()
      if (r) top.current = r.top + window.scrollY
    }
    for (const k of list) {
      if (k === c) continue
      const p = panel(k)
      if (p) toLayer(p, k, (list.indexOf(k) - ci) * w, false)
    }
    if (pendingY.current != null && cp) {
      const y = pendingY.current
      pendingY.current = null
      window.scrollTo(0, y)
      liveY.current = window.scrollY
    }
  }, [panel, toFlow, toLayer])
  // After every render: a page that has just been drawn takes its place.
  useLayoutEffect(() => { settle() })

  // The window's place for the tab on screen.
  useEffect(() => {
    const on = () => { if (!swipe.current && !sliding.current && hereRef.current) liveY.current = window.scrollY }
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  /* ---------- the address ---------- */
  /** Show tab k now, no sliding (a tap, a link, the router). */
  const switchTo = useCallback((k: TabKey) => {
    const was = curRef.current
    if (was !== k) saved.current[was] = liveY.current
    curRef.current = k
    pendingY.current = saved.current[k] || 0
    settle()
  }, [settle])

  // The address moved: by a swipe (ours), or by a tap, a link or the router.
  // With a query or hash the tab starts afresh so it reads them.
  const wasHere = useRef(here)
  useLayoutEffect(() => {
    const before = wasHere.current
    wasHere.current = here
    if (!here) {
      // Off to another page: the tabs wait, each where it was.
      if (before) saved.current[curRef.current] = liveY.current
      return
    }
    if (self.current === here) { self.current = null; return }
    const fresh = !!(location.search || location.hash)
    mount(here)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fresh) setGen(g => ({ ...g, [here]: (g[here] || 0) + 1 }))
    if (fresh) saved.current[here] = 0
    setCur(here)
    switchTo(here)
  }, [here, mount, switchTo])

  // Before a link takes the family to another page: note where this one was.
  useEffect(() => {
    const onClick = () => { if (hereRef.current) saved.current[curRef.current] = liveY.current }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  useEffect(() => {
    const on = () => settle()
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [settle])

  // The other tabs load in the background, nearest first, one at a time,
  // once the first one is up -- and only with a plain address, since a page
  // reads its query when it starts (?qr=… belongs to the tab it was sent to).
  const tabKey = tabs.join(',')
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
      if (location.search || location.hash || !hereRef.current) { timer = setTimeout(next, 1000); return }
      mount(k)
      timer = setTimeout(next, 500)
    }
    timer = setTimeout(next, 900)
    return () => { alive = false; clearTimeout(timer) }
  }, [mount, tabKey])

  /* ---------- the finger ---------- */
  useEffect(() => {
    const html = document.documentElement
    /** Does something under the finger move sideways by itself? */
    const ownsFinger = (el: Element | null) => {
      for (let e = el; e && e !== document.body; e = e.parentElement) {
        if (e.matches(OWN_FINGER)) return true
        if (e.scrollWidth > e.clientWidth + 1) {
          const ox = getComputedStyle(e).overflowX
          if (ox === 'auto' || ox === 'scroll') return true
        }
      }
      return false
    }
    const near = (d: 1 | -1) => {
      const list = tabsRef.current
      const k = list[list.indexOf(curRef.current) + d]
      return k && mountedRef.current.has(k) ? k : null
    }
    let raf = 0
    const draw = () => {
      raf = 0
      const s = swipe.current
      if (!s) return
      const w = window.innerWidth
      // Past the first or last tab it gives a little and no more.
      let x = s.dx
      if ((x > 0 && !s.prev) || (x < 0 && !s.next)) x = x / 4
      const cp = panel(curRef.current)
      if (cp) cp.style.transform = `translate3d(${x}px,0,0)`
      if (s.prev) { const p = panel(s.prev); if (p) p.style.transform = `translate3d(${x - w}px,0,0)` }
      if (s.next) { const p = panel(s.next); if (p) p.style.transform = `translate3d(${x + w}px,0,0)` }
    }
    const begin = (s: Swipe) => {
      s.y = liveY.current
      saved.current[curRef.current] = s.y
      s.prev = near(-1)
      s.next = near(1)
      const w = window.innerWidth
      const cp = panel(curRef.current)
      if (cp) { toLayer(cp, curRef.current, 0, true); cp.classList.add('ts-move') }
      for (const [k, x] of [[s.prev, -w], [s.next, w]] as [TabKey | null, number][]) {
        const p = k && panel(k)
        if (p && k) { toLayer(p, k, x, true); p.classList.add('ts-move') }
      }
      // The 3D swimmer rests while the pages move (SwimmerDeck).
      window.dispatchEvent(new CustomEvent('msa:tab-swipe', { detail: { moving: true } }))
    }
    const finish = (s: Swipe) => {
      const w = window.innerWidth
      // How fast at the end: the last tenth of a second.
      const n = s.t.length
      let speed = 0
      for (let i = n - 1; i > 0; i--) {
        if (s.t[n - 1] - s.t[i - 1] > 100 || i === 1) { speed = (s.xs[n - 1] - s.xs[i - 1]) / Math.max(1, s.t[n - 1] - s.t[i - 1]); break }
      }
      const to = s.dx < 0 ? s.next : s.prev
      const go = !!to && (Math.abs(s.dx) > w * GO_PART || (Math.abs(speed) > GO_SPEED && Math.sign(speed) === Math.sign(s.dx) && Math.abs(s.dx) > 12))
      const shift = go ? (s.dx < 0 ? -w : w) : 0
      const moving = [curRef.current, s.prev, s.next].filter(Boolean) as TabKey[]
      sliding.current = true
      swipe.current = null
      for (const k of moving) {
        const p = panel(k)
        if (!p) continue
        const base = k === curRef.current ? 0 : k === s.prev ? -w : w
        p.style.transition = SLIDE
        p.style.transform = `translate3d(${base + shift}px,0,0)`
      }
      let done = false
      const end = () => {
        if (done) return
        done = true
        sliding.current = false
        if (go && to) {
          const was = curRef.current
          saved.current[was] = s.y
          curRef.current = to
          pendingY.current = saved.current[to] || 0
          self.current = to
          setCur(to)
          const path = TAB_PATHS[to]
          // Safari throws past a hundred history writes in a short time; a
          // missed address is better than a broken page.
          if (location.pathname !== path) try { window.history.replaceState(null, '', path) } catch { /* rate-limited */ }
        } else {
          pendingY.current = s.y
        }
        settle()
        window.dispatchEvent(new CustomEvent('msa:tab-swipe', { detail: { moving: false } }))
      }
      const cp = panel(curRef.current)
      cp?.addEventListener('transitionend', end, { once: true })
      setTimeout(end, 360)
    }

    const onStart = (e: TouchEvent) => {
      swipe.current = null
      if (e.touches.length !== 1 || sliding.current || !hereRef.current) return
      if (html.classList.contains('msa-kb')) return
      // Something open over the page on screen (not in a waiting tab).
      for (const o of document.querySelectorAll(OPEN)) if (!o.closest('.ts-layer')) return
      const target = e.target instanceof Element ? e.target : null
      if (ownsFinger(target)) return
      const t = e.touches[0]
      swipe.current = { x0: t.clientX, y0: t.clientY, dx: 0, dir: null, t: [], xs: [], y: 0, prev: null, next: null }
    }
    const onMove = (e: TouchEvent) => {
      const s = swipe.current
      if (!s || e.touches.length !== 1) return
      const t = e.touches[0]
      const dx = t.clientX - s.x0, dy = t.clientY - s.y0
      if (!s.dir) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        // Clearly sideways, or it is the page's own scrolling.
        if (Math.abs(dx) > Math.abs(dy) * 1.3) { s.dir = 'h'; s.x0 = t.clientX; begin(s) }
        else { swipe.current = null; return }
      }
      s.dx = t.clientX - s.x0
      s.t.push(e.timeStamp); s.xs.push(s.dx)
      if (s.t.length > 12) { s.t.shift(); s.xs.shift() }
      if (!raf) raf = requestAnimationFrame(draw)
    }
    const onEnd = () => {
      const s = swipe.current
      if (!s) return
      if (s.dir !== 'h') { swipe.current = null; return }
      cancelAnimationFrame(raf); raf = 0
      draw()
      finish(s)
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: true })
    document.addEventListener('touchend', onEnd, { passive: true })
    document.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
    }
  }, [settle, panel, toLayer])

  return (
    <div ref={box} className="ts" hidden={!here}>
      {tabs.map(k => {
        const Page = PAGES[k]
        const on = k === cur
        return (
          <section key={k} className="ts-p" data-tab={k} aria-hidden={!on}>
            <div className="ts-in">
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
