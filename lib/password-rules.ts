/* What a new password must be (owner, 2026-11-05, 決定 6 選項 A): at least
   8 characters and not one of the passwords guessed first -- one character
   repeated, a short pattern repeated, a run like 12345678 or abcdefgh, a
   well-known one, or the email itself. This is NIST's advice (length plus a
   blocklist), with no rules about capitals or symbols.

   Checked where a password is chosen: sign-up, the forgot-password reset and
   the careers portal. Passwords set before this keep working; Supabase only
   checks a password when it is set. Supabase's own minimum (Authentication >
   Providers > Email > Minimum password length) is set to the same 8 on both
   projects, so the server refuses a short one too. Keep the two equal. */

export const MIN_PASSWORD = 8

// Lower-case; compared after lower-casing and dropping a trailing run of
// digits or "!" (password1, password123!, iloveyou2 are the same guess).
const COMMON = new Set([
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'asdfghjk', 'asdfghjkl', 'zxcvbnm', 'qwer', 'qwerty1',
  'iloveyou', 'letmein', 'welcome', 'admin', 'administrator', 'monkey', 'dragon', 'football', 'baseball',
  'sunshine', 'princess', 'starwars', 'superman', 'trustno', 'whatever', 'master', 'shadow', 'michael',
  'abc', 'abcd', 'abcde', 'aaaa', 'test', 'testtest', 'changeme', 'secret', 'login', 'hello', 'goodluck',
  'mantashark', 'manta', 'shark', 'swim', 'swimming', 'swimmer', 'brea', 'monrovia', 'aquatics',
  '1q2w3e4r', '1qaz2wsx', 'qazwsx', 'zaq12wsx', 'woaini', 'wodemima', 'mima',
])

export type PasswordIssue = 'short' | 'simple' | 'email'

function isRun(s: string): boolean {
  if (s.length < 4) return false
  const step = s.charCodeAt(1) - s.charCodeAt(0)
  if (step !== 1 && step !== -1) return false
  for (let i = 2; i < s.length; i++) if (s.charCodeAt(i) - s.charCodeAt(i - 1) !== step) return false
  return true
}

/* null = fine. email: the account's address, when known. */
export function passwordIssue(password: string, email?: string | null): PasswordIssue | null {
  if (password.length < MIN_PASSWORD) return 'short'
  const p = password.toLowerCase()
  // One character, or a pattern of up to 4 repeated (11111111, abababab, 12341234).
  for (let n = 1; n <= 4; n++) {
    if (p.length >= n * 2 && p.length % n === 0 && p === p.slice(0, n).repeat(p.length / n)) return 'simple'
  }
  if (isRun(p)) return 'simple'
  // 01234567890 wraps; 98765432 is a run down (caught above).
  if ('01234567890123456789'.includes(p) || '09876543210987654321'.includes(p)) return 'simple'
  const core = p.replace(/[\d!.]+$/, '')
  if (COMMON.has(p) || COMMON.has(core)) return 'simple'
  // Digits only, as a date (20150612, 06122015) -- a birthday is the first guess.
  if (/^\d{8}$/.test(p)) {
    const y1 = +p.slice(0, 4), m1 = +p.slice(4, 6), d1 = +p.slice(6, 8)
    const m2 = +p.slice(0, 2), d2 = +p.slice(2, 4), y2 = +p.slice(4, 8)
    if ((y1 >= 1930 && y1 <= 2035 && m1 >= 1 && m1 <= 12 && d1 >= 1 && d1 <= 31) ||
        (y2 >= 1930 && y2 <= 2035 && m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31)) return 'simple'
  }
  if (email) {
    const e = email.trim().toLowerCase(), local = e.split('@')[0]
    if (p === e || p === local || (local.length >= 4 && p.replace(/[\d!.]+$/, '') === local)) return 'email'
  }
  return null
}

/* The translation key for an issue (parent pages). */
export const PASSWORD_ISSUE_KEY: Record<PasswordIssue, string> = {
  short: 'err.passwordShort',
  simple: 'err.passwordSimple',
  email: 'err.passwordEmail',
}
