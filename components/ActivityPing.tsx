'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

/* Stamps a signed-in parent's last_activity_at (/api/heartbeat) every two
   minutes and whenever the tab comes back. Only while someone is signed in
   (found 2026-10-08): it is mounted on every public page, and for a visitor
   each ping was a function call and a proxy run that could only answer 401.
   onAuthStateChange replays INITIAL_SESSION on subscribe, so it covers the
   first answer as well as signing in or out later. */
export default function ActivityPing() {
  useEffect(() => {
    const supabase = createClient()
    let timer: ReturnType<typeof setInterval> | null = null
    const ping = () => { fetch('/api/heartbeat', { method: 'POST' }).catch(() => {}) }
    const onVisible = () => { if (document.visibilityState === 'visible') ping() }
    const start = () => {
      if (timer) return
      ping()
      timer = setInterval(ping, 2 * 60 * 1000)
      document.addEventListener('visibilitychange', onVisible)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', onVisible)
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return
      if (session?.user) start()
      else stop()
    })
    return () => { stop(); subscription.unsubscribe() }
  }, [])
  return null
}
