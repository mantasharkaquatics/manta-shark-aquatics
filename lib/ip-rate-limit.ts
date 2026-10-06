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

/** A peppered hash of any other key a limit is counted on (a phone number, an
 *  email address), so those are not stored in clear either. */
export function keyHash(kind: string, value: string): string {
  const salt = process.env.GUEST_CHAT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createHash('sha256').update(salt + '|' + kind + '|' + value).digest('hex').slice(0, 32)
}

export type SlotResult = 'ok' | 'limited' | 'error'
export type Slot = { result: SlotResult; id: string | null }

const isMissingTable = (error: unknown) => {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === 'PGRST205'
}

/**
 * Reserve one call on (scope, key) within the window, allowing `max`.
 *
 * Reserve FIRST, then count (found 2026-10-06). Counting first and recording
 * after let twenty simultaneous requests all read "0 so far" and all pass,
 * so a burst stepped straight over every cap. Now each request writes its
 * row, then counts the rows up to and including its own: the first `max`
 * get through and the rest remove their row and are refused, however many
 * arrive at once.
 *
 * 'error' means the table could not be read or written: callers fail closed.
 * A missing table (docs/migration-ip-rate-hits.sql not run) lets the call
 * through, loudly, so sign-up never depends on the migration.
 */
export async function takeSlot(
  svc: Svc, scope: string, key: string, max: number, windowMs: number,
): Promise<Slot> {
  const { data: mine, error: insertError } = await svc.from('ip_rate_hits')
    .insert({ scope, ip_hash: key }).select('id, created_at').single()
  if (insertError || !mine) {
    const missing = isMissingTable(insertError)
    console.error('[ip-rate-limit] reserve', scope, missing ? '(ip_rate_hits table missing -- run docs/migration-ip-rate-hits.sql)' : '', insertError)
    return { result: missing ? 'ok' : 'error', id: null }
  }
  const since = new Date(new Date(mine.created_at).getTime() - windowMs).toISOString()
  const { count, error } = await svc.from('ip_rate_hits')
    .select('id', { count: 'exact', head: true })
    .eq('scope', scope).eq('ip_hash', key)
    .gte('created_at', since).lte('created_at', mine.created_at)
  if (error) {
    console.error('[ip-rate-limit] count', scope, error)
    await releaseSlot(svc, mine.id)
    return { result: 'error', id: null }
  }
  if ((count ?? 0) > max) {
    await releaseSlot(svc, mine.id)
    return { result: 'limited', id: null }
  }
  // No cron owns this table, so roughly one call in a hundred tidies it.
  if (Math.random() < 0.01) {
    await svc.from('ip_rate_hits').delete().lt('created_at', new Date(Date.now() - PURGE_AFTER_MS).toISOString())
  }
  return { result: 'ok', id: mine.id }
}

/** Give a reserved call back -- the send it was for did not happen. */
export async function releaseSlot(svc: Svc, id: string | null | undefined) {
  if (!id) return
  const { error } = await svc.from('ip_rate_hits').delete().eq('id', id)
  if (error) console.error('[ip-rate-limit] release', error)
}

/**
 * Reserve several slots together; all or nothing. On 'limited' or 'error'
 * the slots already taken are given back, and `failed` names the scope that
 * refused. On 'ok', `ids` are what to release if the send then fails.
 */
export async function takeSlots(
  svc: Svc, wants: { scope: string; key: string; max: number; windowMs: number }[],
): Promise<{ result: SlotResult; failed?: string; ids: string[] }> {
  const ids: string[] = []
  for (const w of wants) {
    const slot = await takeSlot(svc, w.scope, w.key, w.max, w.windowMs)
    if (slot.result !== 'ok') {
      for (const id of ids) await releaseSlot(svc, id)
      return { result: slot.result, failed: w.scope, ids: [] }
    }
    if (slot.id) ids.push(slot.id)
  }
  return { result: 'ok', ids }
}

/** The per-network fence (places lookups use it directly). */
export async function takeIpSlot(
  svc: Svc, req: Request, scope: string, max: number, windowMs: number,
): Promise<SlotResult> {
  return (await takeSlot(svc, scope, ipHash(req), max, windowMs)).result
}
