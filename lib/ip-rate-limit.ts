import { createHash } from 'crypto'
import { serviceClient } from '@/lib/api-auth'

/* Per-network fences for public endpoints where every call costs money: the
   parent sign-up SMS code (Twilio) and the address lookup (Google Places).
   Found 2026-10-05: both were open to anyone with no per-IP limit, so a script
   could run up the bills by looping.

   One row per counted call in ip_rate_hits (docs/migration-ip-rate-hits.sql),
   keyed by a scope ('send-otp', 'places-autocomplete', ...) and a peppered
   hash of the caller's IP -- the raw IP is never stored, as in the guest chat.
   A botnet still gets one budget per address; this stops one machine, and the
   per-number / per-key quotas behind it are the next line. */

type Svc = ReturnType<typeof serviceClient>

const PURGE_AFTER_MS = 24 * 60 * 60 * 1000

/** Same shape as app/api/chat/guest: the first x-forwarded-for entry is the
 *  client on Vercel. Callers with no address share one 'unknown' bucket. */
export function ipHash(req: Request): string {
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  const salt = process.env.GUEST_CHAT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createHash('sha256').update(salt + '|rate|' + ip).digest('hex').slice(0, 32)
}

/**
 * Counts this caller's hits on `scope` inside the window and, if under `max`,
 * records one more. 'error' means the count could not be read: callers fail
 * closed, since the point is to stop paid calls going out unmetered.
 */
export async function takeIpSlot(
  svc: Svc, req: Request, scope: string, max: number, windowMs: number,
): Promise<'ok' | 'limited' | 'error'> {
  const hash = ipHash(req)
  const since = new Date(Date.now() - windowMs).toISOString()
  const { count, error } = await svc.from('ip_rate_hits')
    .select('id', { count: 'exact', head: true })
    .eq('scope', scope).eq('ip_hash', hash).gte('created_at', since)
  if (error) {
    // The table not existing yet (docs/migration-ip-rate-hits.sql not run)
    // must not take sign-up down: let the call through, loudly. Any other
    // read failure fails closed, as above.
    const missing = (error as { code?: string }).code === '42P01' || (error as { code?: string }).code === 'PGRST205'
    console.error('[ip-rate-limit] count', scope, missing ? '(ip_rate_hits table missing -- run docs/migration-ip-rate-hits.sql)' : '', error)
    return missing ? 'ok' : 'error'
  }
  if ((count ?? 0) >= max) return 'limited'
  const { error: insertError } = await svc.from('ip_rate_hits').insert({ scope, ip_hash: hash })
  if (insertError) {
    console.error('[ip-rate-limit] insert', scope, insertError)
    return 'error'
  }
  // No cron owns this table, so roughly one call in a hundred tidies it.
  if (Math.random() < 0.01) {
    await svc.from('ip_rate_hits').delete().lt('created_at', new Date(Date.now() - PURGE_AFTER_MS).toISOString())
  }
  return 'ok'
}
