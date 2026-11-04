/* Email addresses typed by a family: does it look like one, and is the
   domain a common misspelling (2026-11-04: "jane@gmial" got a sign-up
   code). Shared by sign-up and forgot-password. */

export const looksLikeEmail = (addr: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(addr.trim())

/** A misspelt common mail domain, corrected; null when it looks fine. */
const DOMAIN_FIX: Record<string, string> = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
  'yaho.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com', 'icloud.con': 'icloud.com', 'iclod.com': 'icloud.com',
}
export function emailTypoFix(addr: string): string | null {
  const at = addr.lastIndexOf('@')
  const fix = at > 0 ? DOMAIN_FIX[addr.slice(at + 1)] : undefined
  return fix ? addr.slice(0, at + 1) + fix : null
}

