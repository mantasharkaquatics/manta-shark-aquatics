import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { serviceClient } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

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
const PURGE_AFTER_DAYS = 7
/* Enough to make a serial guesser crawl, short enough that a coach who
   fat-fingered a digit does not think the iPad has frozen. */
const FAILURE_DELAY_MS = 600

/** Peppered, so a leaked table cannot be reversed -- a bare sha256 of an IPv4
 *  is brute-forceable in seconds. Its own pepper, not the applicant one: two
 *  identity systems, two namespaces. */
function hashIp(ip: string): string {
  return createHash('sha256').update('msa-coach-pin:' + ip).digest('hex')
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function POST(req: NextRequest) {
  const body = await readJson(req)
  if (!body) return badRequest()
  const { pin } = body
  if (typeof pin !== 'string' || !/^[0-9]{8}$/.test(pin)) {
    return NextResponse.json({ error: 'Invalid PIN' }, { status: 400 })
  }

  const supabase = serviceClient()

  // Vercel puts the client first in x-forwarded-for; everything after it is
  // proxies. An empty value still hashes to a stable bucket, which is the
  // right side to err on -- unattributable callers share one budget rather
  // than each getting their own.
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
  const ipHash = hashIp(ip)
  const userAgent = req.headers.get('user-agent')?.slice(0, 300) ?? null
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString()

  const { count: recentFailures } = await supabase
    .from('coach_pin_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('ok', false)
    .gte('created_at', windowStart)

  const failures = recentFailures ?? 0
  if (failures >= MAX_FAILURES) {
    // Deliberately says how long, and does NOT hint whether the PIN was right.
    // A locked-out coach needs to know to wait; an attacker learns nothing.
    return NextResponse.json({
      error: `Too many attempts. Try again in ${WINDOW_MINUTES} minutes, or ask an admin to reset your PIN.`,
      locked: true,
      retry_after_seconds: WINDOW_MINUTES * 60,
    }, { status: 429, headers: { 'Retry-After': String(WINDOW_MINUTES * 60) } })
  }

  const pinHash = createHash('sha256').update(pin).digest('hex')

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, first_name, auth_user_id, email')
    .eq('pin_hash', pinHash)
    .eq('is_active', true)
    .single()

  if (!coach) {
    await supabase.from('coach_pin_attempts')
      .insert({ ip_hash: ipHash, ok: false, user_agent: userAgent })
    await sleep(FAILURE_DELAY_MS)
    const left = Math.max(0, MAX_FAILURES - (failures + 1))
    return NextResponse.json({
      error: left > 0
        ? `Incorrect PIN. ${left} ${left === 1 ? 'attempt' : 'attempts'} left.`
        : `Incorrect PIN. Too many attempts — try again in ${WINDOW_MINUTES} minutes.`,
      attempts_left: left,
    }, { status: 401 })
  }

  const { data: linkData, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: coach.email,
  })

  if (error || !linkData) {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }

  await supabase.from('coach_pin_attempts')
    .insert({ ip_hash: ipHash, ok: true, coach_id: coach.id, user_agent: userAgent })
  // A correct PIN clears this caller's slate, so two fumbles this morning do
  // not leave a coach three keystrokes from a lockout this afternoon.
  await supabase.from('coach_pin_attempts')
    .delete().eq('ip_hash', ipHash).eq('ok', false).gte('created_at', windowStart)
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
