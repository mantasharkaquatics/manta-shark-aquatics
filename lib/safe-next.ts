/* Where to go after signing in or registering, from ?next=. Only a path on
   this site is accepted, so the parameter cannot be used to send someone to
   another site after they log in.

   Found 2026-10-05: the old check (starts with "/", not "//", no "\" or ":")
   let "/\t/evil.com" through. Browsers strip tabs and newlines from a URL
   before parsing it, so that became "//evil.com" -- off-site. The rules now:
   no control characters or whitespace at all, no backslash, exactly one
   leading "/", and -- the backstop -- resolving it against a dummy origin must
   land on that same origin. Whatever trick the first rules miss, the last one
   catches, because it asks the URL parser itself where the link goes. */
const PROBE_ORIGIN = 'https://x.invalid'

/** The value if it is a same-site path, otherwise null. Safe on the server
 *  (proxy.ts uses it) as well as in the browser. */
export function sanitizeNext(next: string | null | undefined): string | null {
  if (!next || typeof next !== 'string') return null
  if (next.length > 2048) return null
  // \s covers tab, newline, CR and the Unicode spaces; the range covers every
  // other C0 control character and DEL.
  if (/[\s\u0000-\u001f\u007f\\]/.test(next)) return null
  if (!next.startsWith('/') || next.startsWith('//')) return null
  try {
    if (new URL(next, PROBE_ORIGIN).origin !== PROBE_ORIGIN) return null
  } catch {
    return null
  }
  return next
}

export function safeNext(): string | null {
  if (typeof window === 'undefined') return null
  return sanitizeNext(new URLSearchParams(window.location.search).get('next'))
}

/** `path` with the current page's ?next= carried over, so moving between
 *  /login and /register does not drop the destination. */
export function withNext(path: string): string {
  const next = safeNext()
  return next ? path + (path.includes('?') ? '&' : '?') + 'next=' + encodeURIComponent(next) : path
}
