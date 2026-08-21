import type { SupabaseClient } from '@supabase/supabase-js'

// Every lesson-credit and make-up-token movement goes through this file.
//
// These are money. A silently failed increment hands a family a free lesson;
// a silently failed decrement takes away a lesson they already paid for, and
// nobody finds out either way. The three RPCs used to be called bare, with the
// result thrown away, at 22 of their 23 call sites.
//
// Postgres refuses to overdraw. Both tables carry a ceiling constraint added
// 2026-08-19 -- token_packages_used_within_total and
// lesson_credits_used_within_total -- because the balance check lives in
// TypeScript while the increment lives in SQL, so two concurrent bookings by
// one parent could both read "one left" and both spend it. The RPCs have no
// upper guard of their own (decrement_used_credits has had a greatest(0, ...)
// floor all along; nobody had written the ceiling). When the race happens the
// second increment now raises, and it arrives here as an ordinary error.
//
// A failure is logged and reported back, never thrown. The caller decides what
// to do with false, and the right answer depends on the order it chose. A route
// that spends AFTER writing the booking row cannot fail the request without
// punishing the family for an accounting write they cannot see, so it ignores
// false and relies on the log -- which carries the row id, and is what makes the
// balance correctable by hand. A route that spends BEFORE writing anything, as
// the cart and hour routes do, treats false as "the race was lost" and turns the
// caller away while there is still nothing to undo.

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

export function refundToken(svc: SupabaseClient, tokenId: string): Promise<boolean> {
  return ledgerRpc(svc, 'decrement_used_tokens', { token_id: tokenId })
}
