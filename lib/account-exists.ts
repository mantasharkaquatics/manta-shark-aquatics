import type { SupabaseClient } from '@supabase/supabase-js'

// Registration used to ask only "is there a parent with this email?". A coach's
// or an admin's address sailed through verification and then failed at the very
// last step, on Supabase auth's own "user already registered" -- after the
// family had entered a name, a phone, an address and two verification codes.
//
// Every one of these people already has a login. Checking all three tables
// turns that dead end into a refusal on the first screen, next to the field
// that caused it.
//
// Consequence worth knowing: a coach whose own child takes lessons cannot
// register with their staff address. They need a second address, or an admin
// creates the family record for them.

/* Exact, case-insensitive email matching (found 2026-10-05).

   These lookups used ilike on the raw address, so "%" and "_" in it were
   wildcards: "%@gmail.com" answered "is there ANY customer at gmail?", which
   is account enumeration. Plain eq on a lowercased value is not enough
   either, because the register page stores the address as typed, so a
   parent's row can be "Jane.Doe@Gmail.com".

   So: ilike with %, _ and \ escaped (backslash is Postgres' default LIKE
   escape), which matches case-insensitively and otherwise literally. "*" is
   the one character that cannot be escaped -- PostgREST rewrites every "*" in
   a like pattern to "%" -- so it becomes "_" (any ONE character), and the
   rows that come back are compared exactly in code. That final compare is
   what makes the answer exact; the pattern only narrows the search. */
export function emailIlikePattern(email: string): string {
  return email.trim().toLowerCase().replace(/[\\%_]/g, c => '\\' + c).replace(/\*/g, '_')
}

export function sameEmail(stored: string | null | undefined, email: string): boolean {
  return !!stored && stored.trim().toLowerCase() === email.trim().toLowerCase()
}

export async function emailHasAccount(svc: SupabaseClient, email: string): Promise<boolean | null> {
  const e = email.trim().toLowerCase()
  for (const table of ['parents', 'coaches', 'admins'] as const) {
    const { data, error } = await svc.from(table).select('id, email').ilike('email', emailIlikePattern(e)).limit(20)
    if (error) return null // caller reports a lookup failure rather than guessing
    if (data && data.some((r: { email: string | null }) => sameEmail(r.email, e))) return true
  }
  return false
}

export async function phoneHasAccount(svc: SupabaseClient, phone: string): Promise<boolean | null> {
  // Stored formats vary (+1 (562) 555-0100, 5625550100), so match on the last
  // ten digits the way the parents lookup always has. Admins have no phone.
  const last10 = phone.replace(/\D/g, '').slice(-10)
  if (last10.length < 10) return false
  for (const table of ['parents', 'coaches'] as const) {
    const { data, error } = await svc.from(table).select('id').like('phone', `%${last10}`).limit(1)
    if (error) return null
    if (data && data.length > 0) return true
  }
  return false
}
