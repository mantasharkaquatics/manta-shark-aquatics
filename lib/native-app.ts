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
  pick(opts: { limit: number; maxSide?: number; labels?: { cancel: string; done: string; recents: string; search: string } }): Promise<{ photos: string[] }>
}
export const photoPickerPlugin = (): PhotoPickerPlugin | null =>
  (cap()?.Plugins?.PhotoPicker as PhotoPickerPlugin | undefined) ?? null

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
export const APP_DETECT_SCRIPT =
  `try{if(navigator.userAgent.indexOf('${APP_UA}')>-1||(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())){document.documentElement.classList.add('${APP_CLASS}');` +
  `var f=function(){var m=document.querySelector('meta[name="viewport"]');if(m&&!/viewport-fit/.test(m.content))m.content+=', viewport-fit=cover'};f();document.addEventListener('DOMContentLoaded',f)}}catch(e){}`

/** Inside the app with the app look on (see APP_DETECT_SCRIPT). */
export const appLook = () => typeof document !== 'undefined' && document.documentElement.classList.contains(APP_CLASS)
