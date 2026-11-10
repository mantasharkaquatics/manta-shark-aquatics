'use client'

/* A page that failed to draw, told to the school (/api/client-error, the
   same road as components/ClientErrorReporter). A React error caught by an
   error boundary never reaches window.onerror, so the boundaries call this
   themselves (2026-11-10: the app showed Next's "This page couldn't load"
   and nothing arrived). Only the path is sent, never the query. */
export function reportClientError(error: unknown, where: string) {
  try {
    if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return
    const e = error as { name?: string; message?: string; stack?: string; digest?: string } | null
    const message = `[${where}] ${e?.name || 'Error'}: ${e?.message || String(error)}${e?.digest ? ' (digest ' + e.digest + ')' : ''}`.slice(0, 300)
    const body = JSON.stringify({ message, stack: (e?.stack || '').slice(0, 1500), path: location.pathname, ua: navigator.userAgent.slice(0, 200) })
    fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch { /* never throw from the reporter */ }
}

/* Code from a deploy that has since been replaced: the page's files are
   gone, so the only cure is loading the page again (once per minute, so a
   real fault cannot loop). */
export function isStaleCode(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null
  return /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(`${e?.name} ${e?.message}`)
}
export function reloadForStaleCode(): boolean {
  try {
    const last = Number(sessionStorage.getItem('msa_stale_reload') || 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem('msa_stale_reload', String(Date.now()))
  } catch { return false }
  location.reload()
  return true
}
