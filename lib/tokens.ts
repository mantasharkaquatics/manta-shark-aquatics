// Token system core (spec: docs/token-system-spec.md v1.1, frozen 2026-07-16)
// All token rules live here. Routes import from this file only.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getTodayLA, getNowMinutesLA, formatDateLA, minutesUntil } from '@/lib/date'

// --- Course-type eligibility (keyed by slug; tokens keep their ORIGINAL course type) ---
// 1on1 token -> 1on1 only; 1on2 token -> 1on2 or 1on4 (cross-eligible); 1on4 token -> 1on4 only.
// Inverse view: for a target course, which token slugs may pay for it.
export const TOKEN_SLUGS_FOR_TARGET: Record<string, string[]> = {
  '1on1': ['1on1'],
  '1on2': ['1on2'],
  '1on4': ['1on4', '1on2'],
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
// Total = floor(purchased lessons / 10) * 2, excluding trials and Swim Team.
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

  const total = Math.floor(purchased / 10) * 2

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

// --- Token expiry helper: 60 days from creation, all sources ---
export const TOKEN_VALIDITY_DAYS = 60

export function tokenExpiryFromNow(): string {
  return new Date(Date.now() + TOKEN_VALIDITY_DAYS * 86400000).toISOString()
}
