import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { serviceClient } from '@/lib/api-auth'
import { readJson } from '@/lib/http'

export const runtime = 'nodejs'

/* An 8-digit PIN is 100 million combinations and, on its own, mints a coach
   session. Unmetered, that is a few hours of scripted guessing. These are the
   brakes.

   THE SHAPE OF THE PROBLEM: there is no username here. A wrong PIN matches no
   coach, so a failure cannot be attributed to an account and there is nothing
   to lock. Only the CALLER can be counted, which stops one machine cold and
   does not stop a botnet. Closing that needs a second factor -- picking your
   name before typing, say -- which is a product decision, not a patch. */
const MAX_FAILURES = 5
const WINDOW_MINUTES = 15
/* A second, longer budget per caller (found 2026-10-05). Five every fifteen
   minutes is still 480 guesses a day from one machine. Thirty a day is room for
   a whole pool deck of coaches sharing one iPad and one IP to fumble, and
   leaves a single machine thousands of years from a PIN. */
const DAILY_MAX_FAILURES = 30
const PURGE_AFTER_DAYS = 7
/* Enough to make a serial guesser crawl, short enough that a coach who
   fat-fingered a digit does not think the iPad has frozen. */
const FAILURE_DELAY_MS = 600

const WINDOW_MS = WINDOW_MINUTES * 60_000
const DAY_MS = 86_400_000

/** Peppered, so a leaked table cannot be reversed -- a bare sha256 of an IPv4
 *  is brute-forceable in seconds. Its own pepper, not the applicant one: two
 *  identity systems, two namespaces. */
function hashIp(ip: string): string {
  return createHash('sha256').update('msa-coach-pin:' + ip).digest('hex')
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** What a caller has left, given their failures (ms timestamps, oldest first).
 *  retryAfterSeconds is how long until both budgets have room again: the lock
 *  lifts when enough of the oldest failures age out of each window. */
function budget(failures: number[], now: number): { left: number; retryAfterSeconds: number } {
  const day = failures.filter(t => t > now - DAY_MS)
  const win = day.filter(t => t > now - WINDOW_MS)
  const left = Math.max(0, Math.min(MAX_FAILURES - win.length, DAILY_MAX_FAILURES - day.length))
  let waitMs = 0
  if (win.length >= MAX_FAILURES) waitMs = Math.max(waitMs, win[win.length - MAX_FAILURES] + WINDOW_MS - now)
  if (day.length >= DAILY_MAX_FAILURES) waitMs = Math.max(waitMs, day[day.length - DAILY_MAX_FAILURES] + DAY_MS - now)
  return { left, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) }
}

/* Every answer carries a `code` and numbers, never a sentence for the page to
   show: /coach-login builds its own message from coach.login.* keys, so a
   coach on the Chinese page reads Chinese (found 2026-10-05). `error` stays for
   logs and anyone calling this by hand. */
function locked(retryAfterSeconds: number) {
  // Deliberately says how long, and does NOT hint whether the PIN was right.
  // A locked-out coach needs to know to wait; an attacker learns nothing.
  return NextResponse.json({
    error: 'Too many attempts',
    code: 'locked',
    locked: true,
    attempts_left: 0,
    retry_after_seconds: retryAfterSeconds,
  }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })
}

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Invalid request body', code: 'invalid_pin' }, { status: 400 })
  const { pin } = body
  if (typeof pin !== 'string' || !/^[0-9]{8}$/.test(pin)) {
    return NextResponse.json({ error: 'Invalid PIN', code: 'invalid_pin' }, { status: 400 })
  }

  const supabase = serviceClient()

  // Vercel puts the client first in x-forwarded-for; everything after it is
  // proxies. An empty value still hashes to a stable bucket, which is the
  // right side to err on -- unattributable callers share one budget rather
  // than each getting their own.
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
  const ipHash = hashIp(ip)
  const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null

  /* The attempt is written BEFORE it is counted (found 2026-10-05). Counting
     first and recording the failure afterwards let a burst of parallel
     requests all read "0 failures" and all reach the PIN table -- the 600 ms
     delay runs per request and slows nothing in parallel. Written first, the
     n-th request to land sees at least the n-1 before it, so no more than
     MAX_FAILURES of any burst get through. It starts as a failure and becomes
     a success only once the PIN has matched. */
  const { data: attempt, error: attemptErr } = await supabase
    .from('coach_pin_attempts')
    .insert({ ip_hash: ipHash, ok: false, user_agent: userAgent })
    .select('id, created_at')
    .single()
  if (attemptErr || !attempt) {
    // Fail closed: no record means no count, and an uncounted guess is the hole.
    console.error('pin-login: attempt record failed', attemptErr)
    return NextResponse.json({ error: 'Login failed', code: 'login_failed' }, { status: 500 })
  }
  // The database's clock, not this server's, so the windows line up with created_at.
  const now = Date.parse(attempt.created_at) || Date.now()

  const { data: failureRows, error: countErr } = await supabase
    .from('coach_pin_attempts')
    .select('id, created_at')
    .eq('ip_hash', ipHash)
    .eq('ok', false)
    .gte('created_at', new Date(now - DAY_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(DAILY_MAX_FAILURES + 200)
  if (countErr) {
    await supabase.from('coach_pin_attempts').delete().eq('id', attempt.id)
    console.error('pin-login: attempt count failed', countErr)
    return NextResponse.json({ error: 'Login failed', code: 'login_failed' }, { status: 500 })
  }
  const others = ((failureRows || []) as { id: string; created_at: string }[])
    .filter(r => r.id !== attempt.id)
    .map(r => Date.parse(r.created_at))
    .filter(Number.isFinite)
  const before = budget(others, now)
  if (before.left === 0) {
    // A locked request is not a guess: its row goes, so the lock lasts as long
    // as it said it would rather than sliding forward with every retry.
    await supabase.from('coach_pin_attempts').delete().eq('id', attempt.id)
    return locked(before.retryAfterSeconds)
  }

  const pinHash = createHash('sha256').update(pin).digest('hex')

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, first_name, auth_user_id, email')
    .eq('pin_hash', pinHash)
    .eq('is_active', true)
    .single()

  if (!coach) {
    // The row written above already records this failure.
    await sleep(FAILURE_DELAY_MS)
    const after = budget([...others, now].sort((a, b) => a - b), now)
    return NextResponse.json({
      error: 'Incorrect PIN',
      code: 'bad_pin',
      attempts_left: after.left,
      // The last try: the boxes close now rather than on the next keystroke.
      ...(after.left === 0 ? { locked: true, retry_after_seconds: after.retryAfterSeconds } : {}),
    }, { status: 401 })
  }

  const { data: linkData, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: coach.email,
  })

  if (error || !linkData) {
    // The PIN was right, so this was not a guess; it does not count against them.
    await supabase.from('coach_pin_attempts').delete().eq('id', attempt.id)
    return NextResponse.json({ error: 'Login failed', code: 'login_failed' }, { status: 500 })
  }

  await supabase.from('coach_pin_attempts')
    .update({ ok: true, coach_id: coach.id }).eq('id', attempt.id)
  /* A correct PIN no longer clears this caller's failures (found 2026-10-05).
     It used to, so a coach who knew their own PIN could guess four, sign in as
     themselves, and guess four more, forever -- searching for a colleague's PIN
     with the counter never filling. Fumbles now simply age out of the window. */
  // No cron owns this table, so it tidies itself on the rare successful login
  // rather than growing forever.
  await supabase.from('coach_pin_attempts')
    .delete().lt('created_at', new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000).toISOString())

  return NextResponse.json({
    ok: true,
    name: coach.first_name,
    token_hash: linkData.properties?.hashed_token,
    email: coach.email,
  })
}
