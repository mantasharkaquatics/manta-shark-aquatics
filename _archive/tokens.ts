// Token system core (spec: docs/token-system-spec.md v1.1, frozen 2026-07-16)
// All token rules live here. Routes import from this file only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayLA, getNowMinutesLA, formatDateLA, minutesUntil } from '@/lib/date'

// --- Course-type eligibility (keyed by slug; tokens keep their ORIGINAL course type) ---
// No course type crosses into another: a token pays for its own course only.
// (Until 2026-08-27 a 1on2 token could also pay for a 1on4 lesson. The owner
// asked for strict isolation, because the two course types are priced apart.)
// Inverse view: for a target course, which token slugs may pay for it.
export const TOKEN_SLUGS_FOR_TARGET: Record<string, string[]> = {
  '1on1': ['1on1'],
  '1on2': ['1on2'],
  '1on4': ['1on4'],
  // 'team' intentionally absent: Swim Team never uses tokens
}

export function tokenSlugsForTarget(targetSlug: string): string[] {
  return TOKEN_SLUGS_FOR_TARGET[targetSlug] ?? []
}

// --- Unified time window (LA time). 7:30 PM next-day cutoff is ABOLISHED. ---
// Lead time: lesson start must be >= now + 30 minutes (applies to BOTH credit and token bookings).
export const LEAD_TIME_MINUTES = 30

export function meetsLeadTime(session_date: string, start_time: string): boolean {
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  if (session_date < today) return false
  return minutesUntil(session_date, start_time, today, nowMin) >= LEAD_TIME_MINUTES
}

// 24h cancellation cutoff (spec v1.2 L27/L55): booking is NOT restricted; sessions starting
// within 24 hours cannot be rescheduled, and cancelling converts the credit to a token.
export function isWithin24Hours(session_date: string, start_time: string): boolean {
  const today = getTodayLA()
  const nowMin = getNowMinutesLA()
  if (session_date < today) return true
  return minutesUntil(session_date, start_time, today, nowMin) < 24 * 60
}

// Token window: lead time AND (today or tomorrow only).
export function isWithinTokenWindow(session_date: string, start_time: string): boolean {
  if (!meetsLeadTime(session_date, start_time)) return false
  const today = getTodayLA()
  const tomorrow = formatDateLA(new Date(Date.now() + 86400000))
  return session_date === today || session_date === tomorrow
}

// --- Cancellation-to-token quota (fully derived, no counter columns) ---
// Total = floor(purchased lessons / 10), excluding trials and Swim Team:
// every 10 lessons bought earns ONE within-24h cancel-to-token conversion.
// (Was 2 per 10 until 2026-08-30; the owner halved it. If you change the
// number, change docs/token-system-spec.md, lib/ai/policies.ts and the
// User Agreement section 4 in the same commit -- parents are told this
// number in all four places.)
// Used = count of token_packages with source='cancellation'.
export const TEAM_SLUG = 'team'

export async function getCancellationQuota(
  svc: SupabaseClient,
  parentId: string
): Promise<{ total: number; used: number; remaining: number }> {
  const { data: teamRow } = await svc
    .from('course_types').select('id').eq('slug', TEAM_SLUG).single()
  const teamId = teamRow?.id ?? null

  const { data: credits } = await svc
    .from('lesson_credits')
    .select('total_credits, course_type_id, is_trial')
    .eq('parent_id', parentId)

  const purchased = (credits ?? [])
    .filter(c => !c.is_trial && c.course_type_id !== teamId)
    .reduce((sum, c) => sum + (c.total_credits ?? 0), 0)

  const total = Math.floor(purchased / 10)

  const { count } = await svc
    .from('token_packages')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', parentId)
    .eq('source', 'cancellation')

  const used = count ?? 0
  return { total, used, remaining: Math.max(0, total - used) }
}

// --- FIFO token pick for a booking (earliest expiry first) ---
// Returns the token package to deduct from, or null if none usable.
export async function pickTokenPackage(
  svc: SupabaseClient,
  parentId: string,
  targetCourseSlug: string,
  session_date: string,
  start_time: string
): Promise<{ id: string; course_type_id: string } | null> {
  if (!isWithinTokenWindow(session_date, start_time)) return null
  const slugs = tokenSlugsForTarget(targetCourseSlug)
  if (slugs.length === 0) return null

  const { data: ctRows } = await svc
    .from('course_types').select('id, slug').in('slug', slugs)
  const ctIds = (ctRows ?? []).map(r => r.id)
  if (ctIds.length === 0) return null

  const nowIso = new Date().toISOString()
  const { data: packs } = await svc
    .from('token_packages')
    .select('id, course_type_id, total_tokens, used_tokens, expires_at')
    .eq('parent_id', parentId)
    .in('course_type_id', ctIds)
    .gt('expires_at', nowIso)
    .order('expires_at', { ascending: true })

  const pick = (packs ?? []).find(p => p.used_tokens < p.total_tokens)
  return pick ? { id: pick.id, course_type_id: pick.course_type_id } : null
}

// --- The whole spendable pool for a course type, earliest-expiring first ---
// pickTokenPackage answers "one token for this booking". A booking that pays
// for more than one seat -- a same-account 1-on-2, an hour lesson -- has to see
// the pool, or it hands back the same package twice and spends it once.
export async function tokenPool(
  svc: SupabaseClient,
  parentId: string,
  targetCourseSlug: string
): Promise<{ id: string; remaining: number }[]> {
  const slugs = tokenSlugsForTarget(targetCourseSlug)
  if (slugs.length === 0) return []
  const { data: ctRows } = await svc
    .from('course_types').select('id, slug').in('slug', slugs)
  const ctIds = (ctRows ?? []).map(r => r.id)
  if (ctIds.length === 0) return []
  const { data: packs } = await svc
    .from('token_packages')
    .select('id, total_tokens, used_tokens, expires_at')
    .eq('parent_id', parentId)
    .in('course_type_id', ctIds)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
  return (packs ?? [])
    .map(x => ({ id: x.id, remaining: x.total_tokens - x.used_tokens }))
    .filter(x => x.remaining > 0)
}

// Hand out one token id per seat, FIFO. Returns null when the pool is short:
// every seat a family pays for settles the same way, because a lesson that is
// part token and part credit has no clean cancellation -- a token booking is
// final, a credit booking is not, and half a 1-on-2 is not a lesson.
export function allocateTokens(
  pool: { id: string; remaining: number }[],
  seats: number
): string[] | null {
  const left = pool.map(p => ({ ...p }))
  const out: string[] = []
  for (let i = 0; i < seats; i++) {
    const pick = left.find(p => p.remaining > 0)
    if (!pick) return null
    pick.remaining--
    out.push(pick.id)
  }
  return out
}

// --- Token expiry helper: 60 days from creation, all sources ---
export const TOKEN_VALIDITY_DAYS = 60

export function tokenExpiryFromNow(): string {
  return new Date(Date.now() + TOKEN_VALIDITY_DAYS * 86400000).toISOString()
}
