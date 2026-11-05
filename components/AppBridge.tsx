'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { handleAppBack } from '@/lib/app-back'
import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/i18n/provider'
import { APP_CLASS, TEXT_SIZE_FN, applyPhoneTextSize, appPlatform, appPlugin, pushPlugin, rememberToken, rememberedToken, type NativeListenable } from '@/lib/native-app'

/* Push notifications inside the phone app (owner, 2026-10-27; lib/push.ts).
   Renders nothing, and does nothing in a browser.

   When someone is signed in on the app: ask once for permission to notify
   (the phone's own prompt), get the phone's Firebase token and tell the
   server who it belongs to (/api/push/device). Again each time the app comes
   back to the front, so the server knows the family still uses it. Signing
   out forgets the phone, so the next person's notices are not the last one's.
   Tapping a notification opens the page it names. */

export default function AppBridge() {
  const locale = useLocale()
  // The language the server writes this phone's notices in; sent again the
  // next time the app comes to the front.
  const localeRef = useRef(locale)
  // Tells the server again when the language changes. The first report goes
  // out from the sign-in page, which opens in the phone's language; the
  // family's own (the cookie, the dashboard) arrives a moment later, and both
  // test phones were left registered as English (2026-10-27).
  const resync = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (localeRef.current === locale) return
    localeRef.current = locale
    resync.current?.()
  }, [locale])

  // The app look, for a build the <head> script missed (lib/native-app.ts).
  useEffect(() => {
    if (appPlatform()) document.documentElement.classList.add(APP_CLASS)
  }, [])

  // The Android back button (lib/app-back.ts).
  const router = useRouter()
  useEffect(() => {
    const app = appPlugin()
    if (!app || appPlatform() !== 'android') return
    let handle: unknown = null
    try {
      handle = app.addListener('backButton', e => {
        const canGoBack = !!(e as { canGoBack?: boolean } | null)?.canGoBack
        handleAppBack({
          canGoBack,
          goHome: () => router.push('/dashboard'),
          minimize: () => { try { (app as { minimizeApp?: () => unknown }).minimizeApp?.() } catch { /* older build */ } },
        })
      })
    } catch { /* no listener: the build's own back stays */ }
    return () => {
      Promise.resolve(handle).then(h => { try { (h as { remove?: () => unknown } | null)?.remove?.() } catch { /* gone */ } }).catch(() => {})
    }
  }, [router])

  // What the iPhone's web view does with the text size, once per launch,
  // to the server log (app/api/app/diag; temporary, 2026-11-04).
  useEffect(() => {
    if (appPlatform() !== 'ios') return
    const t = window.setTimeout(() => {
      try {
        const h = document.documentElement
        const probe = document.createElement('span')
        probe.style.font = '-apple-system-body'
        probe.textContent = '測試'
        document.body.appendChild(probe)
        const bodyPx = getComputedStyle(probe).fontSize
        probe.remove()
        const box = document.createElement('div')
        box.style.cssText = 'position:absolute;left:-9999px;top:0;width:300px'
        box.innerHTML = '<span style="font-size:16px;line-height:1">測試 Test</span><div style="-webkit-text-size-adjust:150%;text-size-adjust:150%"><span style="font-size:16px;line-height:1">測試 Test</span></div>'
        document.body.appendChild(box)
        const [a, b] = [...box.querySelectorAll('span')].map(x => Math.round(x.getBoundingClientRect().height * 10) / 10)
        box.remove()
        const report = { bodyPx, headScript: (window as unknown as { __msaLate?: number }).__msaLate ? 'late' : typeof (window as unknown as { __msaTextSize?: unknown }).__msaTextSize, htmlAdjust: h.style.webkitTextSizeAdjust || null, data: h.getAttribute('data-text-size'), plain16: a, adjusted150: b, ua: navigator.userAgent.slice(0, 160) }
        fetch('/api/app/diag', { method: 'POST', body: JSON.stringify(report), keepalive: true }).catch(() => {})
      } catch { /* a look only */ }
    }, 3000)
    return () => window.clearTimeout(t)
  }, [])

  // The phone's text size may have been changed while the app was away (lib/native-app.ts).
  useEffect(() => {
    if (!appPlatform()) return
    // A build whose <head> script never ran still follows the phone.
    const w = window as unknown as { __msaTextSize?: unknown }
    if (typeof w.__msaTextSize !== 'function') {
      try { new Function('window.__msaTextSize=' + TEXT_SIZE_FN + ';window.__msaLate=1')() } catch {}
    }
    applyPhoneTextSize()
    const on = () => { if (document.visibilityState === 'visible') applyPhoneTextSize() }
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  useEffect(() => {
    const fm = pushPlugin()
    const platform = appPlatform()
    if (!fm || !platform) return
    const supabase = createClient()
    const removers: (() => void)[] = []
    let busy = false
    let again = false

    const sync = async (ask: boolean, freshToken?: string) => {
      // One at a time; a call that comes in meanwhile runs once more after,
      // so a language change during the first report is not lost.
      if (busy) { again = true; return }
      busy = true
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        let perm = (await fm.checkPermissions()).receive
        if (ask && (perm === 'prompt' || perm === 'prompt-with-rationale')) perm = (await fm.requestPermissions()).receive
        const granted = perm === 'granted'
        // Without permission there may be no token to fetch; the one from
        // before is then reported as switched off.
        const token = freshToken || (granted ? (await fm.getToken()).token : rememberedToken())
        if (!token) return
        rememberToken(token)
        await fetch('/api/push/device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform, permission: granted, lang: localeRef.current }),
        })
      } catch {
        // A push is extra; nothing on the page depends on it.
      } finally {
        busy = false
        if (again) { again = false; sync(false) }
      }
    }
    resync.current = () => { sync(false) }
    removers.push(() => { resync.current = null })

    const forget = () => {
      const token = rememberedToken()
      if (!token) return
      rememberToken(null)
      fetch('/api/push/device', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => {})
    }

    /* Listen to a native event without trusting the bridge's return value.
       Inside the app the plugins are reached through Capacitor's raw bridge
       (lib/native-app.ts), whose addListener does NOT return a promise; the
       first build called .then on it, and that uncaught error took the whole
       page down to "This page couldn't load" (found on the first Android
       run, 2026-10-27). A push is extra: nothing here may break the site. */
    const listen = (plugin: NativeListenable | null, event: string, fn: (e: unknown) => void) => {
      if (!plugin) return
      try {
        const handle = plugin.addListener(event, fn)
        Promise.resolve(handle).then(h => {
          const remove = (h as { remove?: () => unknown } | null)?.remove
          if (typeof remove === 'function') removers.push(() => { try { remove.call(h) } catch { /* gone */ } })
        }).catch(() => {})
      } catch { /* no listener, no crash */ }
    }

    sync(true)
    listen(fm, 'tokenReceived', e => {
      const token = (e as { token?: string } | null)?.token
      if (token) sync(false, token)
    })
    listen(fm, 'notificationActionPerformed', e => {
      const url = (e as { notification?: { data?: Record<string, unknown> } } | null)?.notification?.data?.url
      // Our own pages only.
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) window.location.assign(url)
    })
    listen(appPlugin(), 'appStateChange', e => { if ((e as { isActive?: boolean } | null)?.isActive) sync(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN') sync(true)
      if (event === 'SIGNED_OUT') forget()
    })
    removers.push(() => subscription.unsubscribe())

    return () => removers.forEach(r => r())
  }, [])

  return null
}
