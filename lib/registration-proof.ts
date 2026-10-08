import type { SupabaseClient } from '@supabase/supabase-js'

/* The "this email / phone was verified recently" proof that sign-up needs.
   Shared by /api/auth/complete-registration (which spends it) and
   /api/auth/check-registration-proof (which only looks, before the browser
   creates the login -- found 2026-10-08, see that route). */

// How long a verified code stays good for creating the account. Codes
// themselves live ten minutes; this covers filling in the rest of the form.
export const PROOF_WINDOW_MS = 60 * 60 * 1000

export type OtpTable = 'phone_otps' | 'email_otps'

// Same normalisation as app/api/auth/send-otp and verify-otp, so the phone
// here finds the row those routes wrote.
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return phone.startsWith('+') ? phone : '+' + digits
}

// Postgres "undefined column": the migration has not been run yet.
export function isMissingColumn(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === '42703' || /used_(at|by)/.test(err.message || ''))
}

export async function findProof(svc: SupabaseClient, table: OtpTable, col: 'phone' | 'email', value: string, windowMs = PROOF_WINDOW_MS):
  Promise<{ id: string | null; tracked: boolean } | { error: unknown }> {
  const since = new Date(Date.now() - windowMs).toISOString()
  const base = () => svc.from(table).select('id')
    .eq(col, value).eq('verified', true).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(1)
  const first = await base().is('used_at', null)
  if (!first.error) return { id: first.data?.[0]?.id ?? null, tracked: true }
  if (!isMissingColumn(first.error)) return { error: first.error }
  const legacy = await base()
  if (legacy.error) return { error: legacy.error }
  return { id: legacy.data?.[0]?.id ?? null, tracked: false }
}

export const EMAIL_NOT_VERIFIED = { error: 'Email verification is missing or has expired. Please verify your email again.', code: 'EMAIL_NOT_VERIFIED' }
export const PHONE_NOT_VERIFIED = { error: 'Phone verification is missing or has expired. Please verify your phone number again.', code: 'PHONE_NOT_VERIFIED' }
