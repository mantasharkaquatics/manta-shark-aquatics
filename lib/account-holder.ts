/* "THIS SWIMMER IS ME" (audit F15, owner 2026-10-16).

   An adult who registers and swims themselves is the account holder. The
   birthday card speaks to them as "you" only when it knows that, and guessing
   it from names failed for Chinese names (parent 名字 小明 / 姓氏 王, swimmer
   王小明) and for nicknames. So the family says so: a box on registration and
   on My Account's add-a-swimmer form, stored as students.is_account_holder
   (docs/migration-account-holder-swimmer.sql). At most one active swimmer per
   family carries it: setting it on one clears it on the others first, and a
   partial unique index backs that up.

   Only an adult (18 or over, the birthday card's own line) can be the account
   holder: a child cannot hold an account, and the card's "you" wording exists
   only for adults. The box is therefore shown only once the birthday entered
   makes the swimmer an adult, and the server ignores it otherwise.

   Accounts from before the box fall back to the name match below.

   The column may not exist yet (the SQL is run by hand). Nothing here may
   fail because of that: a write that meets "column does not exist" is skipped
   and reported as 'no_column', and readers retry without the column.

   Only a type import: the register page and My Account (browser) use the
   age and name helpers, and scripts/account-holder-check.mjs loads this file
   as is. */

import type { SupabaseClient } from '@supabase/supabase-js'

/** An adult swimmer, as the birthday card counts it. */
export const ADULT_AGE = 18

/** Whole years reached on `today` (both YYYY-MM-DD), or null for a bad date. */
export function ageOn(dob: string | null | undefined, today: string): number | null {
  if (!dob || !/^\d{4}-\d{2}-\d{2}/.test(dob) || !/^\d{4}-\d{2}-\d{2}/.test(today)) return null
  const [by, bm, bd] = dob.slice(0, 10).split('-').map(Number)
  const [ty, tm, td] = today.slice(0, 10).split('-').map(Number)
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age--
  return age
}

/** Old enough to be the account holder. */
export const isAdultOn = (dob: string | null | undefined, today: string) => {
  const a = ageOn(dob, today)
  return a !== null && a >= ADULT_AGE
}

/** A name compared without spaces, case or full-width forms (Ｊａｎｅ = jane). */
export const foldName = (s: string | null | undefined) =>
  String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()

const firstWord = (s: string | null | undefined) =>
  String(s || '').normalize('NFKC').trim().split(/\s+/)[0]?.toLowerCase() || ''

/**
 * The fallback for accounts from before the box: does the swimmer's one
 * free-text name read as the parent's? The same first word ("Jane Doe" /
 * Jane), or the whole name equal to first+last or last+first once spaces,
 * case and full-width forms are taken out (王小明 = 王 + 小明; "Doe Jane").
 * A nickname (Jen / Jennifer) still reads as someone else -- that is what
 * the box is for.
 */
export function nameLooksLikeHolder(fullName: string | null | undefined, first: string | null | undefined, last: string | null | undefined): boolean {
  const n = foldName(fullName), f = foldName(first), l = foldName(last)
  if (!n || !f) return false
  if (firstWord(first) && firstWord(first) === firstWord(fullName)) return true
  return !!l && (n === f + l || n === l + f)
}

/** Postgres "column does not exist" (42703) or PostgREST's schema-cache miss
 *  (PGRST204), as other optional columns in this repo are detected. */
export const missingHolderColumn = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /is_account_holder/.test(e.message || ''))

/**
 * Make `studentId` the family's account holder (or nobody, with null).
 * The others are cleared first, so the one-per-family index is never hit by
 * our own write. Server only (service role).
 */
export async function setAccountHolder(svc: SupabaseClient, parentId: string, studentId: string | null): Promise<'ok' | 'no_column' | 'error'> {
  let q = svc.from('students').update({ is_account_holder: false })
    .eq('parent_id', parentId).eq('is_account_holder', true)
  if (studentId) q = q.neq('id', studentId)
  const { error: clearErr } = await q
  if (clearErr) {
    if (missingHolderColumn(clearErr)) return 'no_column'
    console.error('[account-holder] clear failed', clearErr)
    return 'error'
  }
  if (!studentId) return 'ok'
  const { error } = await svc.from('students').update({ is_account_holder: true })
    .eq('id', studentId).eq('parent_id', parentId)
  if (error) {
    if (missingHolderColumn(error)) return 'no_column'
    console.error('[account-holder] set failed', error)
    return 'error'
  }
  return 'ok'
}
