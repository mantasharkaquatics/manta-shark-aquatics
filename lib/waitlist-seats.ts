import type { SupabaseClient } from '@supabase/supabase-js'
import type { WaitEntry } from './waitlist'

/* The part of lib/waitlist.ts the squad-cap checks need, with nothing
   server-only in it: lib/pos/sale-checks.ts is also read by the desk's POS
   screen in the browser. */

const COLS = 'id, parent_id, student_id, kind, team_tier_id, class_session_id, coach_id, course_type_id, slot_date, slot_start, minutes, status, offered_at, offer_expires_at, created_at'
const missingTable = (e: any) => !!e && (e.code === '42P01' || e.code === 'PGRST205' || /waitlist_entries/.test(e.message || ''))

/** Live offers, read once. [] before the migration. */
export async function liveOffers(svc: SupabaseClient): Promise<WaitEntry[]> {
  const { data, error } = await svc.from('waitlist_entries').select(COLS).eq('status', 'offered')
    .gt('offer_expires_at', new Date().toISOString())
  if (error) { if (!missingTable(error)) console.error('waitlist offers:', error.message); return [] }
  return (data || []) as WaitEntry[]
}

/** Squad seats held by live offers to swimmers other than exceptStudentId. */
export async function teamSeatsHeld(svc: SupabaseClient, tierId: string, exceptStudentId?: string | null): Promise<number> {
  return (await liveOffers(svc)).filter(o => o.kind === 'team' && o.team_tier_id === tierId && o.student_id !== exceptStudentId).length
}
/** The same for every squad at once: tier id -> seats held. */
export async function teamSeatsHeldAll(svc: SupabaseClient): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const o of await liveOffers(svc)) if (o.kind === 'team' && o.team_tier_id) out[o.team_tier_id] = (out[o.team_tier_id] || 0) + 1
  return out
}

