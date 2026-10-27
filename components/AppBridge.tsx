'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/i18n/provider'
import { appPlatform, appPlugin, pushPlugin, rememberToken, rememberedToken } from '@/lib/native-app'

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
  useEffect(() => { localeRef.current = locale }, [locale])

  useEffect(() => {
    const fm = pushPlugin()
    const platform = appPlatform()
    if (!fm || !platform) return
    const supabase = createClient()
    const removers: (() => void)[] = []
    let busy = false

    const sync = async (ask: boolean, freshToken?: string) => {
      if (busy) return
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
      }
    }

    const forget = () => {
      const token = rememberedToken()
      if (!token) return
      rememberToken(null)
      fetch('/api/push/device', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => {})
    }

    sync(true)
    fm.addListener('tokenReceived', e => { if (e?.token) sync(false, e.token) }).then(l => removers.push(() => { l.remove() })).catch(() => {})
    fm.addListener('notificationActionPerformed', e => {
      const url = e?.notification?.data?.url
      // Our own pages only.
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) window.location.assign(url)
    }).then(l => removers.push(() => { l.remove() })).catch(() => {})
    appPlugin()?.addListener('appStateChange', e => { if (e?.isActive) sync(false) })
      .then(l => removers.push(() => { l.remove() })).catch(() => {})

    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_IN') sync(true)
      if (event === 'SIGNED_OUT') forget()
    })
    removers.push(() => subscription.unsubscribe())

    return () => removers.forEach(r => r())
  }, [])

  return null
}
