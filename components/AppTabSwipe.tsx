'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { tabSwipePlugin } from '@/lib/native-app'

/* Swiping between the app's tabs (owner, 2026-11-13, "原生手勢＋快照").

   The finger is followed by iOS itself (mobile/ios/App/App/SceneDelegate.swift,
   TabSwipe), never by the page: the page as it is slides away and the tab
   beside it slides in as a picture of it, then the page goes there. The
   tabs side by side inside the page (components/TabPager, 2026-11-10) are
   switched off: on the iPhone a scroller inside a scroller broke 預約's
   scrolling and the first swimmer.

   This tells the app, whenever something changes:
   - which tab is open (its place in the tab bar's order) and how many;
   - whether a swipe may start at all: only on a tab's own page, with no
     sheet or dialog open and the keyboard down;
   - where it may not start: anything that moves sideways itself (the
     swimmer cards, 我的方案) and the swimmer's grab boxes.
   It asks for a picture of the tab when the page is at its top and settled
   (a tab arrives at its top, so the picture matches), goes to the tab when
   the app says the swipe went through, and says when that tab is drawn so
   the picture can go. Nothing here runs outside the iPhone app. */

const OPEN = '.msa-sheet-back, .msa-dlg-back, .mst-back, .msa-lsheet-wrap, .pc-view, .sw-scrim.on, [aria-modal="true"]:not([aria-hidden="true"])'
const LOADING = /載入中|加载中|Loading…/

const bare = (p: string) => p.replace(/^\/zh-Han[ts](?=\/|$)/, '') || '/'

/** Things that move sideways on their own, as x, y, w, h, x, y, w, h, ... */
function blockedRects(): number[] {
  const out: number[] = []
  const h = window.innerHeight
  const add = (el: Element) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > h) return
    out.push(Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height))
  }
  for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX
      if (ox === 'auto' || ox === 'scroll') add(el)
    }
  }
  // The swimmer itself (turning it), and anything a page marks. A single
  // swimmer card does not move sideways, so a swipe may start on it.
  for (const el of document.querySelectorAll('.sw-hold, [data-no-tab-swipe]')) add(el)
  return out
}

/** The tab arrived at looks drawn: no "loading", and 首頁's swimmer is there. */
function looksDrawn(): boolean {
  const main = document.querySelector('main')
  if (!main || LOADING.test(main.innerText)) return false
  if (document.querySelector('.sw-deck') && !document.querySelector('.sw-live canvas')) return false
  return true
}

export default function AppTabSwipe({ tabs }: { tabs: string[] }) {
  const plugin = tabSwipePlugin()
  const router = useRouter()
  const pathname = bare(usePathname() || '/')
  const current = tabs.indexOf(pathname)
  const tabsRef = useRef(tabs)
  useEffect(() => { tabsRef.current = tabs }, [tabs])
  // The tab a swipe went to, until it is drawn.
  const arriving = useRef<string | null>(null)

  /** Why a swipe may not start now ('' = it may), for the app's log. */
  const whyNot = (): string => {
    if (current < 0) return 'not a tab'
    if (arriving.current) return 'arriving'
    if (document.documentElement.classList.contains('msa-kb')) return 'keyboard'
    const open = document.querySelector(OPEN)
    if (open) return 'open: ' + (open.className || open.getAttribute('role') || open.tagName)
    return ''
  }
  const allowedNow = () => whyNot() === ''

  // Tell the app, now and whenever the page changes.
  useEffect(() => {
    if (!plugin) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let last = ''
    const send = () => {
      try {
        const why = whyNot()
        const allowed = why === ''
        const o = { count: tabsRef.current.length, current, allowed, blocked: allowed ? blockedRects() : [], why }
        // Only when something changed: every call is a trip across the bridge.
        const k = JSON.stringify(o)
        if (k === last) return
        last = k
        plugin.configure(o)
      } catch { /* an older app: no swiping */ }
    }
    const soon = () => { clearTimeout(timer); timer = setTimeout(send, 120) }
    send()
    const mo = new MutationObserver(soon)
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'aria-hidden', 'aria-modal', 'hidden', 'open'] })
    const mh = new MutationObserver(soon)
    mh.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    window.addEventListener('scroll', soon, { passive: true, capture: true })
    window.addEventListener('resize', soon)
    return () => {
      clearTimeout(timer); mo.disconnect(); mh.disconnect()
      window.removeEventListener('scroll', soon, { capture: true })
      window.removeEventListener('resize', soon)
      // Leaving the tab: nothing may start until the next page says so.
      try { plugin.configure({ count: 0, current: -1, allowed: false, blocked: [] }) } catch { /* older app */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, current, tabs.length])

  // A picture of the tab while it is at its top and settled.
  useEffect(() => {
    if (!plugin || current < 0) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const shoot = () => {
      if (window.scrollY > 4 || !allowedNow() || !looksDrawn()) return
      try { plugin.snap({ index: current }) } catch { /* older app */ }
    }
    const later = (ms: number) => { clearTimeout(timer); timer = setTimeout(shoot, ms) }
    later(1200)
    const onScroll = () => later(500)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin, current])

  // The app says a swipe went through: go to that tab.
  useEffect(() => {
    if (!plugin) return
    let remove: (() => void) | null = null
    let gone = false
    try {
      const handle = plugin.addListener('swipe', e => {
        const to = tabsRef.current[Number((e as { index?: number } | null)?.index)]
        if (!to) { try { plugin.ready() } catch { /* older app */ } return }
        arriving.current = to
        router.push(to)
      })
      Promise.resolve(handle).then(h => {
        const r = (h as { remove?: () => unknown } | null)?.remove
        if (typeof r === 'function') { if (gone) r.call(h); else remove = () => { try { r.call(h) } catch { /* gone */ } } }
      }).catch(() => {})
    } catch { /* no listener, no swiping */ }
    return () => { gone = true; remove?.() }
  }, [plugin, router])

  // Arrived: once the tab is drawn (at most 1.5 s), the picture goes.
  useEffect(() => {
    if (!plugin || !arriving.current || arriving.current !== pathname) return
    let n = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const check = () => {
      if (looksDrawn() || ++n > 15) {
        arriving.current = null
        try { plugin.ready() } catch { /* older app */ }
        // Swiping may start again: tell the app now.
        window.dispatchEvent(new Event('resize'))
        return
      }
      timer = setTimeout(check, 100)
    }
    // Two frames: the new page has painted at least once.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => { timer = setTimeout(check, 60) }))
    return () => { cancelAnimationFrame(id); clearTimeout(timer) }
  }, [plugin, pathname])

  return null
}
