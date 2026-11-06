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
  'aa', 'asdf', 'zxcv', 'qwerty123', 'iloveyou', 'football', 'baseball', 'soccer', 'basketball', 'family', 'children',
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

// Keyboard rows and the column walks people type (14-role test 2, J38):
// any piece of these, 6 or more long, is a guess.
const KEYBOARD = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx3edc4rfv5tgb', 'q1w2e3r4t5y6u7i8o9p0', 'qazwsxedcrfv', '1q2w3e4r5t6y7u8i9o0p']
// Look-alike letters people swap in: P@ssw0rd is password.
const LEET: Record<string, string> = { '@': 'a', '4': 'a', '0': 'o', '1': 'i', '!': 'i', '3': 'e', '$': 's', '5': 's', '7': 't' }

/** A short pattern repeated, the last copy cut short too (abcabcab, 12121212). */
function isRepeat(p: string): boolean {
  for (let n = 1; n <= 4; n++) {
    if (p.length >= n * 2 && p === p.slice(0, n).repeat(Math.ceil(p.length / n)).slice(0, p.length)) return true
  }
  // Pairs: 11223344, aabbccdd.
  return p.length >= 6 && p.length % 2 === 0 && [...Array(p.length / 2)].every((_, i) => p[2 * i] === p[2 * i + 1])
}
function isSimpleCore(c: string): boolean {
  return c.length <= 2 || isRepeat(c) || isRun(c) || COMMON.has(c)
    || KEYBOARD.some(k => c.length >= 6 && k.includes(c))
}

/* null = fine. email: the account's address, when known. */
export function passwordIssue(password: string, email?: string | null): PasswordIssue | null {
  if (password.length < MIN_PASSWORD) return 'short'
  const p = password.toLowerCase()
  if (isRepeat(p) || isRun(p)) return 'simple'
  // 01234567890 wraps; 98765432 is a run down (caught above).
  if ('01234567890123456789'.includes(p) || '09876543210987654321'.includes(p)) return 'simple'
  if (KEYBOARD.some(k => k.includes(p))) return 'simple'
  // Two runs side by side: asdf1234, 1234abcd.
  for (let i = 3; i <= p.length - 3; i++) {
    const a = p.slice(0, i), b = p.slice(i)
    if ((isRun(a) || KEYBOARD.some(k => a.length >= 4 && k.includes(a))) && (isRun(b) || KEYBOARD.some(k => b.length >= 4 && k.includes(b)))) return 'simple'
  }
  // What is left once the look-alikes are read back and the digits and
  // signs at either end are dropped: password1!, P@ssw0rd, aaaaaaa1, a1234567.
  const plain = p.replace(/[@4013!$57]/g, ch => LEET[ch] || ch)
  // (A letter or two around digits counts too: a1234567, 12345678a.)
  const digitsCore = p.replace(/^[a-z]+|[a-z]+$/g, '')
  const cores = [p.replace(/^[\d\W_]+|[\d\W_]+$/g, ''), plain.replace(/^[\d\W_]+|[\d\W_]+$/g, '')]
  if (digitsCore.length >= p.length - 2) cores.push(digitsCore)
  for (const c of cores) if (isSimpleCore(c)) return 'simple'
  if (COMMON.has(plain)) return 'simple'
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
