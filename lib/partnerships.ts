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
