'use client'

/* Errors in a visitor's browser, sent to /api/client-error so the school
   hears about a page that breaks on someone's phone (owner, 2026-10-26:
   error alerts; lib/error-report.ts). Renders nothing.

   Kept quiet on purpose: at most three reports per page load, each message
   once, and none of the noise every site sees -- browser extensions, a
   dropped connection, an old tab loading files a new deploy replaced.
   Only the page's path is sent (no query string, which can hold tokens). */
import { useEffect } from 'react'

const NOISE = [
  /ResizeObserver loop/i, /^Script error\.?$/i, /Failed to fetch/i, /Load failed/i, /NetworkError/i,
  /AbortError/i, /The operation was aborted/i, /ChunkLoadError/i, /Loading chunk/i, /Loading CSS chunk/i,
  /Non-Error promise rejection/i, /cancelled|canceled/i,
]

export default function ClientErrorReporter() {
  useEffect(() => {
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return
    const sent = new Set<string>()
    const send = (message: string, stack: string | undefined, file: string | undefined) => {
      try {
        message = String(message || '').slice(0, 300)
        if (!message || sent.size >= 3 || sent.has(message)) return
        if (NOISE.some(r => r.test(message))) return
        // Someone else's script (an extension, an injected widget).
        if (file && !file.startsWith(location.origin)) return
        if (stack && /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack)) return
        sent.add(message)
        const body = JSON.stringify({ message, stack: (stack || '').slice(0, 1500), path: location.pathname, ua: navigator.userAgent.slice(0, 200) })
        fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
      } catch { /* never throw from the reporter */ }
    }
    const onError = (e: ErrorEvent) => send(e.message || e.error?.message, e.error?.stack, e.filename)
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason
      send(r instanceof Error ? `${r.name}: ${r.message}` : typeof r === 'string' ? r : '', r instanceof Error ? r.stack : undefined, undefined)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])
  return null
}
