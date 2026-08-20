import type { SupabaseClient } from '@supabase/supabase-js'

// Every lesson-credit and make-up-token movement goes through this file.
//
// These are money. A silently failed increment hands a family a free lesson;
// a silently failed decrement takes away a lesson they already paid for, and
// nobody finds out either way. The three RPCs used to be called bare, with the
// result thrown away, at 22 of their 23 call sites.
//
// A failure is logged and reported back, never thrown. By the time these run
// the booking row has already been written, so failing the request would
// punish the family for an accounting write they cannot see. The log carries
// the row id, which is what makes the balance correctable by hand afterwards.
// The caller decides what to do with false; most correctly ignore it, and the
// cart route -- which still holds a rollback -- does not.

async function ledgerRpc(
  svc: SupabaseClient,
  fn: string,
  args: Record<string, string>
): Promise<boolean> {
  const { error } = await svc.rpc(fn, args)
  if (error) {
    console.error(`ledger: ${fn} failed`, args, error.message)
    return false
  }
  return true
}

export function spendCredit(svc: SupabaseClient, creditId: string): Promise<boolean> {
  return ledgerRpc(svc, 'increment_used_credits', { credit_id: creditId })
}

export function refundCredit(svc: SupabaseClient, creditId: string): Promise<boolean> {
  return ledgerRpc(svc, 'decrement_used_credits', { credit_id: creditId })
}

export function spendToken(svc: SupabaseClient, tokenId: string): Promise<boolean> {
  return ledgerRpc(svc, 'increment_used_tokens', { token_id: tokenId })
}
