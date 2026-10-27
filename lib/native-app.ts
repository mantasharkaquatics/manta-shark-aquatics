/* The phone app (owner, 2026-10-27): a native shell that opens this site and
   adds what a website cannot do -- push notifications and the camera.

   Inside the app, Capacitor puts a bridge on window: window.Capacitor, with
   the native plugins under Capacitor.Plugins. On a normal browser none of this
   exists, so everything here answers "not the app" and the site behaves
   exactly as before. The plugins' JavaScript is NOT bundled into the site:
   the bridge already exposes them, and the browser build stays as it was. */

type Listener = { remove: () => Promise<void> | void }

export type PushPermission = 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'

export interface FirebaseMessagingPlugin {
  checkPermissions(): Promise<{ receive: PushPermission }>
  requestPermissions(): Promise<{ receive: PushPermission }>
  getToken(): Promise<{ token: string }>
  addListener(event: 'tokenReceived', fn: (e: { token: string }) => void): Promise<Listener>
  addListener(event: 'notificationActionPerformed', fn: (e: { notification?: { data?: Record<string, unknown> } }) => void): Promise<Listener>
}

interface AppPlugin {
  addListener(event: 'appStateChange', fn: (e: { isActive: boolean }) => void): Promise<Listener>
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean
  getPlatform?: () => string
  Plugins?: { FirebaseMessaging?: FirebaseMessagingPlugin; App?: AppPlugin; [name: string]: unknown }
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

export const pushPlugin = (): FirebaseMessagingPlugin | null => cap()?.Plugins?.FirebaseMessaging ?? null
export const appPlugin = (): AppPlugin | null => (cap()?.Plugins?.App as AppPlugin | undefined) ?? null

const TOKEN_KEY = 'msa_push_token'
export function rememberedToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}
export function rememberToken(token: string | null) {
  try { if (token) localStorage.setItem(TOKEN_KEY, token); else localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ }
}
