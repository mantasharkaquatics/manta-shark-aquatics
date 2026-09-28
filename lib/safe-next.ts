/* Where to go after signing in or registering, from ?next=. Only a path on
   this site is accepted: a full URL, a protocol-relative "//host" or anything
   with a backslash is ignored, so the parameter cannot be used to send someone
   to another site after they log in. */
export function safeNext(): string | null {
  if (typeof window === 'undefined') return null
  const next = new URLSearchParams(window.location.search).get('next')
  if (!next || !next.startsWith('/') || next.startsWith('//') || /[\\:]/.test(next)) return null
  return next
}
