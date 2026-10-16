/* "THIS SWIMMER IS ME" (audit F15, owner 2026-10-16).

   An adult who registers and swims themselves is the account holder. The
   birthday card speaks to them as "you" only when it knows that, and guessing
   it from names failed for Chinese names (parent 名字 小明 / 姓氏 王, swimmer
   王小明) and for nicknames. So the family says so: a box on registration and
   on My Account's add-a-swimmer form, stored as students.is_account_holder
   (docs/migration-account-holder-swimmer.sql).

   The column has three values, and that is the point of it:
     true  -- this swimmer is the account holder. At most one active swimmer
              per family: setting it on one clears it on the others first, and
              a partial unique index backs that up.
     false -- said not to be (the box left unticked on a new swimmer, a minor,
              or the desk unticked it). Never "you", whatever the names say.
     null  -- nobody has said: swimmers from before the box, or a database
              without the column yet. Only these fall back to the name match.
   accountHolderOf() is the one rule; the birthday card and Admin > Members
   both use it.

   Only an adult (18 or over, the birthday card's own line) can be the account
   holder: a child cannot hold an account, and the card's "you" wording exists
   only for adults. The box is therefore shown only once the birthday entered
   makes the swimmer an adult, and the server writes false otherwise.

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

/**
 * The name fallback, for a swimmer nobody has marked either way: the
 * swimmer's one free-text name, with spaces, case and full-width forms taken
 * out, equals the parent's first+last or last+first (王小明 = 王 + 小明;
 * "Doe Jane"). Whole names only (review, 2026-10-16): a shared first word made
 * John Smith's adult son "John Smith Jr." and José Luis García's son "José
 * García" read as the parent. A nickname (Jen / Jennifer) reads as someone
 * else -- that is what the box is for.
 */
export function nameLooksLikeHolder(fullName: string | null | undefined, first: string | null | undefined, last: string | null | undefined): boolean {
  const n = foldName(fullName), f = foldName(first), l = foldName(last)
  if (!n || !f || !l) return false
  return n === f + l || n === l + f
}

export type HolderRow = {
  id: string
  full_name: string | null
  date_of_birth: string | null
  /** true / false as stored; null or absent when nobody has said. */
  is_account_holder?: boolean | null
}

/**
 * Which of a family's ACTIVE swimmers is the account holder, or null.
 *   1. A swimmer marked true is, and no other swimmer can be.
 *   2. Otherwise the name fallback, and only when the family has exactly one
 *      adult (on `onDate`) and that adult is unmarked (null): a swimmer marked
 *      false never is, and with two adults a name is not enough to choose.
 */
export function accountHolderOf(family: HolderRow[], first: string | null | undefined, last: string | null | undefined, onDate: string): string | null {
  const marked = family.find(r => r.is_account_holder === true)
  if (marked) return marked.id
  const adults = family.filter(r => isAdultOn(r.date_of_birth, onDate))
  if (adults.length !== 1) return null
  const only = adults[0]
  if (only.is_account_holder === false) return null
  return nameLooksLikeHolder(only.full_name, first, last) ? only.id : null
}

/** Postgres "column does not exist" (42703) or PostgREST's schema-cache miss
 *  (PGRST204), as other optional columns in this repo are detected. */
export const missingHolderColumn = (e: { code?: string; message?: string } | null | undefined) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204' || /is_account_holder/.test(e.message || ''))

/** One write, read as "done" or "the column is not there yet". */
async function holderWrite(q: PromiseLike<{ error: { code?: string; message?: string } | null }>, what: string): Promise<'ok' | 'no_column' | 'error'> {
  const { error } = await q
  if (!error) return 'ok'
  if (missingHolderColumn(error)) return 'no_column'
  console.error(`[account-holder] ${what} failed`, error)
  return 'error'
}

/**
 * Make `studentId` the family's account holder (or nobody, with null).
 * The others marked true are set false first, so the one-per-family index is
 * never hit by our own write. Server only (service role).
 */
export async function setAccountHolder(svc: SupabaseClient, parentId: string, studentId: string | null): Promise<'ok' | 'no_column' | 'error'> {
  let q = svc.from('students').update({ is_account_holder: false })
    .eq('parent_id', parentId).eq('is_account_holder', true)
  if (studentId) q = q.neq('id', studentId)
  const cleared = await holderWrite(q, 'clear')
  if (cleared !== 'ok' || !studentId) return cleared
  return holderWrite(svc.from('students').update({ is_account_holder: true })
    .eq('id', studentId).eq('parent_id', parentId), 'set')
}

/** Say that this swimmer is NOT the account holder (the desk unticking). */
export function setNotAccountHolder(svc: SupabaseClient, parentId: string, studentId: string): Promise<'ok' | 'no_column' | 'error'> {
  return holderWrite(svc.from('students').update({ is_account_holder: false })
    .eq('id', studentId).eq('parent_id', parentId), 'unset')
}

/**
 * Swimmers just created (registration, add-a-swimmer) get an explicit answer:
 * `meId` true (the others in the family cleared), every other new one false,
 * so none of them is ever left to the name guess. Written after the insert,
 * on its own, so a database without the column still saves the swimmers.
 */
export async function recordNewSwimmers(svc: SupabaseClient, parentId: string, newIds: string[], meId: string | null): Promise<'ok' | 'no_column' | 'error'> {
  const others = newIds.filter(id => id !== meId)
  if (others.length > 0) {
    const r = await holderWrite(svc.from('students').update({ is_account_holder: false })
      .eq('parent_id', parentId).in('id', others), 'mark new')
    if (r !== 'ok') return r
  }
  return meId ? setAccountHolder(svc, parentId, meId) : 'ok'
}
