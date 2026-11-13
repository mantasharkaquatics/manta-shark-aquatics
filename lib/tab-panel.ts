'use client'

import { createContext, useContext } from 'react'

/* The app's five tabs side by side (owner, 2026-11-10, 選項 A: a swipe
   should reveal the next tab under the finger, already drawn -- no loading,
   no flicker). components/TabPager.tsx keeps one copy of each tab's page,
   the one on screen an ordinary page, the others waiting; this is what a
   page needs to know about that.

   Outside the app, and on every other page, there is no panel: useTabPanel()
   is null and everything works as a normal page with the window scrolling. */

export type TabKey = 'home' | 'book' | 'schedule' | 'chat' | 'me'

export const TAB_PATHS: Record<TabKey, string> = {
  home: '/dashboard',
  book: '/booking',
  schedule: '/dashboard/schedule',
  chat: '/dashboard/chat',
  me: '/dashboard/me',
}

export function tabOfPath(path: string): TabKey | null {
  const bare = path.replace(/^\/zh-Han[ts](?=\/|$)/, '') || '/'
  for (const k of Object.keys(TAB_PATHS) as TabKey[]) if (TAB_PATHS[k] === bare) return k
  return null
}

/** tab: which panel this page is in; active: it is the one on screen. */
export const TabPanelContext = createContext<{ tab: TabKey; active: boolean } | null>(null)
export const useTabPanel = () => useContext(TabPanelContext)

/* What scrolls a page up and down. Since 2026-11-13 the tab on screen is
   an ordinary page and the window scrolls it, in the app as on the website
   (components/TabPager); these stay so pages need not change again. `from`
   is kept for the same reason. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function scrollerOf(from?: Element | null): HTMLElement | null {
  return null
}

export function pageScrollTop(from?: Element | null): number {
  const s = scrollerOf(from)
  return s ? s.scrollTop : window.scrollY
}

export function pageScrollTo(top: number, smooth = false, from?: Element | null) {
  const s = scrollerOf(from)
  const opts: ScrollToOptions = { top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' }
  if (s) s.scrollTo(opts)
  else window.scrollTo(opts)
}

/** The bottom of the page (its full height). */
export function pageScrollHeight(from?: Element | null): number {
  const s = scrollerOf(from)
  return s ? s.scrollHeight : document.documentElement.scrollHeight
}

/** An element's distance from the top of its page's content. */
export function pageOffsetTop(el: Element): number {
  const s = scrollerOf(el)
  return s ? el.getBoundingClientRect().top - s.getBoundingClientRect().top + s.scrollTop
    : el.getBoundingClientRect().top + window.scrollY
}
