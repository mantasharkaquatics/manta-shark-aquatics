import type { SupabaseClient } from '@supabase/supabase-js'
import { emailHasAccount } from '@/lib/account-exists'
import { sendEmail } from '@/lib/email'

/* Staff logins: changing the email a coach or manager signs in with
   (owner, 2026-10-13). The school gives every coach and manager a mailbox on
   mantasharkaquatics.com, and existing staff move from their personal address
   to it.

   The email lives in two places that must agree: the Supabase Auth login, and
   the email column of every row that login owns (coaches, admins -- and
   parents, for a staff member who is also a family). The coach PIN login signs
   in by coaches.email, so a coaches row left on the old address would lock
   that coach out. The login moves first; if a row then fails to follow, the
   login is moved back. */

export type ChangeEmailResult =
  | { ok: true; oldEmail: string; newEmail: string }
  | { ok: false; code: 'bad_email' | 'same_email' | 'email_taken' | 'no_login' | 'server'; status: number }

export function normalizeEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase()
}

export function looksLikeEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

const ROW_TABLES = ['coaches', 'admins', 'parents'] as const

export async function changeLoginEmail(
  svc: SupabaseClient,
  authUserId: string | null | undefined,
  rawEmail: unknown,
  changedBy: string,
): Promise<ChangeEmailResult> {
  const newEmail = normalizeEmail(rawEmail)
  if (!looksLikeEmail(newEmail)) return { ok: false, code: 'bad_email', status: 400 }
  if (!authUserId) return { ok: false, code: 'no_login', status: 409 }

  const { data: got, error: getErr } = await svc.auth.admin.getUserById(authUserId)
  if (getErr || !got?.user) return { ok: false, code: 'no_login', status: 409 }
  const oldEmail = normalizeEmail(got.user.email)
  if (oldEmail === newEmail) return { ok: false, code: 'same_email', status: 400 }

  // Any family, coach or manager already on that address -- the same check
  // registration and "add coach" use.
  const taken = await emailHasAccount(svc, newEmail)
  if (taken === null) return { ok: false, code: 'server', status: 500 }
  if (taken) return { ok: false, code: 'email_taken', status: 409 }

  const { error: authErr } = await svc.auth.admin.updateUserById(authUserId, { email: newEmail, email_confirm: true })
  if (authErr) {
    // A login with no family/staff row can still hold the address.
    const dup = /already|registered|exists/i.test(authErr.message || '')
    if (!dup) console.error('[staff-email] auth update failed', authErr)
    return { ok: false, code: dup ? 'email_taken' : 'server', status: dup ? 409 : 500 }
  }

  for (const table of ROW_TABLES) {
    const { error } = await svc.from(table).update({ email: newEmail }).eq('auth_user_id', authUserId)
    if (error) {
      console.error(`[staff-email] ${table} row not updated; moving the login back`, error)
      const { error: backErr } = await svc.auth.admin.updateUserById(authUserId, { email: oldEmail, email_confirm: true })
      if (backErr) console.error('[staff-email] ⚠️ LOGIN LEFT ON THE NEW EMAIL, rows on the old one', backErr)
      for (const done of ROW_TABLES) {
        if (done === table) break
        await svc.from(done).update({ email: oldEmail }).eq('auth_user_id', authUserId)
      }
      return { ok: false, code: 'server', status: 500 }
    }
  }

  // The old address hears about it (owner, 2026-10-13), so a mistaken or
  // unwanted change is noticed by the person it happened to. Never blocks.
  const sent = await sendEmail({ type: 'staff_email_changed', to: oldEmail, newValue: newEmail, changedBy }).catch(() => false)
  if (!sent) console.error(`[staff-email] notice to the old address ${oldEmail} not sent`)

  return { ok: true, oldEmail, newEmail }
}

/** The admin's display name and whether they may manage other managers. */
export async function adminRole(svc: SupabaseClient, adminId: string): Promise<string | null> {
  const { data } = await svc.from('admins').select('role').eq('id', adminId).maybeSingle()
  return (data as { role: string | null } | null)?.role ?? null
}
