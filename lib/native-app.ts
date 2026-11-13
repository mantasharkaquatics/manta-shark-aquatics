/* The phone app (owner, 2026-10-27): a native shell that opens this site and
   adds what a website cannot do -- push notifications and the camera.

   Inside the app, Capacitor puts a bridge on window: window.Capacitor, with
   the native plugins under Capacitor.Plugins. On a normal browser none of this
   exists, so everything here answers "not the app" and the site behaves
   exactly as before. The plugins' JavaScript is NOT bundled into the site:
   the bridge already exposes them, and the browser build stays as it was. */

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'

/** A plugin with events. Through the raw bridge addListener does NOT return a
 *  promise (seen on Android, 2026-10-27), so its result is left unknown. */
export interface NativeListenable {
  addListener(event: string, fn: (e: unknown) => void): unknown
}

export interface FirebaseMessagingPlugin extends NativeListenable {
  checkPermissions(): Promise<{ receive: PushPermission }>
  requestPermissions(): Promise<{ receive: PushPermission }>
  getToken(): Promise<{ token: string }>
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: { FirebaseMessaging?: FirebaseMessagingPlugin; App?: NativeListenable; [name: string]: unknown }
}

function cap(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null
  const c = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor
  return c && c.isNativePlatform?.() ? c : null
}

/** Running inside the phone app (not a browser). */
export const isNativeApp = () => cap() !== null

/** 'ios' or 'android' inside the app, null in a browser. */
export function appPlatform(): 'ios' | 'android' | null {
  const p = cap()?.getPlatform?.()
  return p === 'ios' || p === 'android' ? p : null
}

/* The chat's photo picker (owner, 2026-10-28: pictures only -- no camera, no
   files). Native code in the iOS app (mobile/ios/App/App/PhotoPicker.swift)
   opens the photo library alone and hands back shrunk JPEGs as base64.
   Missing on Android, where the page's own file button already opens a
   picture-only picker, and on iPhone builds made before it. */
export interface PhotoPickerPlugin {
  pick(opts: { limit: number; maxSide?: number; labels?: { recents: string; search: string } }): Promise<{ photos: string[] }>
}
export const photoPickerPlugin = (): PhotoPickerPlugin | null =>
  (cap()?.Plugins?.PhotoPicker as PhotoPickerPlugin | undefined) ?? null

/* Subscribing the iPhone calendar to the family's lessons (owner,
   2026-11-02). Native code in the iOS app (mobile/ios/App/App/CalendarAdd.swift)
   hands the webcal:// link to iOS, which asks "Subscribe to calendar?". The
   web view cannot: the link is on the site's own address, so the app keeps
   it, fails to open it and shows its offline page. Missing on Android and on
   iPhone builds made before it. */
export interface CalendarAddPlugin {
  subscribe(opts: { url: string }): Promise<{ opened: boolean }>
}
export const calendarAddPlugin = (): CalendarAddPlugin | null =>
  (cap()?.Plugins?.CalendarAdd as CalendarAddPlugin | undefined) ?? null

/* Swiping between the tabs (owner, 2026-11-13): iOS follows the finger
   itself (mobile/ios/App/App/SceneDelegate.swift, TabSwipe) and asks the
   page to go to the tab swiped to; components/AppTabSwipe.tsx tells it
   where a swipe may start. Missing on Android and on older iPhone builds. */
export interface TabSwipePlugin extends NativeListenable {
  configure(opts: { count: number; current: number; allowed: boolean; blocked: number[]; why?: string }): unknown
  snap(opts: { index: number }): unknown
  ready(): unknown
}
export const tabSwipePlugin = (): TabSwipePlugin | null =>
  (cap()?.Plugins?.TabSwipe as TabSwipePlugin | undefined) ?? null

/** The app's language button (components/AppShell) asks the website bar
 *  (components/Navbar), which stays mounted inside the app, to switch:
 *  detail = the Locale. */
export const APP_SET_LOCALE_EVENT = 'msa:set-locale'

export const pushPlugin = (): FirebaseMessagingPlugin | null => cap()?.Plugins?.FirebaseMessaging ?? null
export const appPlugin = (): NativeListenable | null => cap()?.Plugins?.App ?? null

const TOKEN_KEY = 'msa_push_token'
export function rememberedToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function rememberToken(token: string | null) {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ }
}

/* The app's own look (owner, 2026-10-27): inside the app the site drops its
   website bar, footer and chat bubble and gets a top bar and five tabs
   (components/AppShell.tsx). Browsers keep the website, phones included.

   The class is put on <html> by a script in the root layout's <head>, before
   the first paint, so the website bar never flashes up first. The app adds
   APP_UA to its user agent (mobile/capacitor.config.json, appendUserAgent);
   builds made before that are known by Capacitor's bridge instead. */
export const APP_UA = 'MantaSharkApp'
export const APP_CLASS = 'msa-app'
/* Inside the app the page also runs under the iPhone's home indicator (owner,
   2026-10-28: the white band under the tabs had to go), so the viewport is
   told to cover the whole screen and env(safe-area-inset-bottom) says how
   tall that band is. Browsers are left exactly as they were. */
export function coverViewport() {
  if (typeof document === 'undefined') return
  const m = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null
  if (m && !/viewport-fit/.test(m.content)) m.content += ', viewport-fit=cover'
}
/* The phone's text size (owner, 2026-11-04, 問題 2 選項 A: grandparents found
   the app's text too small; follow the phone's own setting, no switch in the
   app). Android's web view already scales text by the phone's font size. The
   iPhone's does not: it is read here from the system body font (17px at the
   standard size, -apple-system-body follows 設定 → 螢幕顯示與亮度 → 文字大小)
   and handed to -webkit-text-size-adjust on <html>, which every font size
   inherits. Only ever larger than the design, and at most 140%, past which
   the cards and tabs stop fitting. Run before the first paint (in
   APP_DETECT_SCRIPT) and again whenever the app comes back to the front, in
   case the setting was changed meanwhile (components/AppBridge.tsx). */
/* Measured on a span of its own: set on <html> itself the system font read
   back as the standard size whatever the phone said (2026-11-05, from the
   app's own report: a span said 19px and 23px, <html> stayed unchanged).
   The size already set is taken off first: the span inherits it, so every
   later run (on load, on return to the app) read the enlarged font and
   enlarged it again -- one step up on the phone went to the 140% cap
   (owner, 2026-11-05). Nothing is painted in between.
   Plain strings joined at run time -- see APP_DETECT_SCRIPT for why. */
export const TEXT_SIZE_FN = [
  "function(){try{var h=document.documentElement;if(!/iPhone|iPad|iPod/.test(navigator.userAgent)&&!(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1))return;",
  "var sp=document.createElement('span');sp.style.font='-apple-system-body';sp.style.position='absolute';sp.style.visibility='hidden';sp.textContent='x';",
  "h.style.webkitTextSizeAdjust='';h.style.textSizeAdjust='';(document.body||h).appendChild(sp);var px=parseFloat(getComputedStyle(sp).fontSize);sp.remove();",
  "if(!(px>0))return;var k=Math.min(1.4,Math.max(1,px/17));var v=k>1.02?Math.round(k*100)+'%':'';",
  "h.style.webkitTextSizeAdjust=v;h.style.textSizeAdjust=v;if(v)h.setAttribute('data-text-size',v);else h.removeAttribute('data-text-size')}catch(e){}}",
].join('')
export const applyPhoneTextSize = () => {
  if (typeof window === 'undefined') return
  const h = document.documentElement, before = h.getAttribute('data-text-size')
  ;(window as unknown as { __msaTextSize?: () => void }).__msaTextSize?.()
  // Pages that size themselves to the screen (the home cards) measure again on resize.
  if (h.getAttribute('data-text-size') !== before) window.dispatchEvent(new Event('resize'))
}

/* The <head> script. Written as plain strings in an array joined at run
   time, never as template strings or `+` chains: the production build's
   minifier folded the earlier `a${APP_CLASS}b` + `c` + ... chain wrongly and
   dropped a whole piece -- from the class name's closing quote through the
   首頁 redirect (seen 2026-11-05 in the live page and reproduced with a local
   `next build`: classList.add('msa-appwindow...'), a syntax error, so none of
   it ran: no text size, no redirect from the website's home page). The dev
   server never minifies, so it never showed there.
   The website's home page is not part of the app (owner, 2026-11-03: it left
   customers on a page with no way back): the 首頁 tab instead, which sends a
   signed-out family on to the login page (proxy.ts). Plain comparisons for
   the path, no regular expression. */
export const APP_DETECT_SCRIPT = [
  "try{if(navigator.userAgent.indexOf('", APP_UA, "')>-1||(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())){",
  "document.documentElement.classList.add('", APP_CLASS, "');",
  "var pth=location.pathname;if(pth==='/'||pth==='/zh-Hant'||pth==='/zh-Hans'||pth==='/zh-Hant/'||pth==='/zh-Hans/')location.replace('/dashboard');",
  "window.__msaTextSize=", TEXT_SIZE_FN, ";window.__msaTextSize();document.addEventListener('DOMContentLoaded',function(){window.__msaTextSize()});",
  "var f=function(){var m=document.querySelector('meta[name=\"viewport\"]');if(m&&!/viewport-fit/.test(m.content))m.content+=', viewport-fit=cover'};f();document.addEventListener('DOMContentLoaded',f)",
  "}}catch(e){}",
].join('')

/* What the root layout puts in <head>. */
export const APP_DETECT_INLINE = APP_DETECT_SCRIPT

/** Inside the app with the app look on (see APP_DETECT_SCRIPT). */
export const appLook = () => typeof document !== 'undefined' && document.documentElement.classList.contains(APP_CLASS)
