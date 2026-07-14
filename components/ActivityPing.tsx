'use client'

import { useEffect } from 'react'

export default function ActivityPing() {
  useEffect(() => {
    const ping = () => { fetch('/api/heartbeat', { method: 'POST' }).catch(() => {}) }
    ping()
    const id = setInterval(ping, 2 * 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') ping() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  return null
}
