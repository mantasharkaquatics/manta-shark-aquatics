import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The active link between two families, if there is one. A cross-account
 * 1-on-2 invitation is only allowed between linked families; the routes used
 * to check only that the invited child belonged to the named parent, and kept
 * whatever partnership id the client sent (found 2026-10-03).
 */
export async function activePartnershipId(svc: SupabaseClient, a: string, b: string | null | undefined): Promise<string | null> {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  // Both go into a filter string, so only ids of the expected shape.
  if (!b || a === b || !UUID.test(a) || !UUID.test(b)) return null
  const { data } = await svc.from('parent_partnerships')
    .select('id')
    .eq('status', 'active')
    .or(`and(initiator_parent_id.eq.${a},partner_parent_id.eq.${b}),and(initiator_parent_id.eq.${b},partner_parent_id.eq.${a})`)
    .limit(1)
  return data?.[0]?.id ?? null
}

/**
 * How many open invitations a family may have at once (found 2026-10-15).
 * An invitation charges nothing until it is accepted, yet holds its coach and
 * time for 15 minutes (lib/bookings/invite-holds.ts), and nothing limited how
 * many a family could send -- two linked accounts could keep a coach's whole
 * day looking booked for free by re-sending as each one lapsed.
 */
export const MAX_OPEN_INVITES = 3
export const OPEN_INVITES_ERROR =
  'You have too many 1-on-2 invitations waiting for an answer. Please wait for the other family to answer, or for one to expire after 15 minutes.'

/**
 * Whether this family already has MAX_OPEN_INVITES invitations waiting. One
 * invitation is the inviter's own unanswered rows: one for a 30-minute
 * lesson, two halves sharing a lesson_group_id for an hour lesson. A failed
 * read lets the booking through, logged: the limit is a fence against abuse,
 * not something a family's lesson should fail on.
 */
export async function openInvitesAtLimit(svc: SupabaseClient, parentId: string): Promise<boolean> {
  const { data, error } = await svc.from('bookings').select('id, lesson_group_id')
    .eq('parent_id', parentId).eq('status', 'pending_partner').is('pending_action', null)
    .gt('pending_expires_at', new Date().toISOString())
    .limit(200)
  if (error) {
    console.error('open invitations not read:', error.message)
    return false
  }
  const invitations = new Set((data || []).map(r => r.lesson_group_id || r.id))
  return invitations.size >= MAX_OPEN_INVITES
}
