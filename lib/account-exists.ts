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

export async function emailHasAccount(svc: SupabaseClient, email: string): Promise<boolean | null> {
  const e = email.trim().toLowerCase()
  for (const table of ['parents', 'coaches', 'admins'] as const) {
    const { data, error } = await svc.from(table).select('id').ilike('email', e).limit(1)
    if (error) return null // caller reports a lookup failure rather than guessing
    if (data && data.length > 0) return true
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
