import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { serviceClient } from '@/lib/api-auth'

export const APPLICANT_COOKIE = 'msa_applicant_session'
export const SESSION_DAYS = 30
export const MIN_PASSWORD_LENGTH = 8
const BCRYPT_COST = 12

export type Applicant = {
  id: string
  legal_first_name: string
  legal_last_name: string
  email: string
  phone: string
  email_verified_at: string | null
  phone_verified_at: string | null
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return 'Password must be at least ' + MIN_PASSWORD_LENGTH + ' characters.'
  }
  if (password.length > 200) return 'Password is too long.'
  return null
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function generateCode(): string {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
}

export function hashIp(ip: string | null): string | null {
  return ip ? sha256('msa-applicant:' + ip) : null
}

export async function createSession(
  applicantId: string,
  meta?: { ip?: string | null; userAgent?: string | null }
): Promise<void> {
  const token = crypto.randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)

  const { error } = await serviceClient().from('applicant_sessions').insert({
    applicant_id: applicantId,
    token_hash: sha256(token),
    expires_at: expiresAt.toISOString(),
    ip_hash: hashIp(meta?.ip ?? null),
    user_agent: meta?.userAgent ?? null,
  })
  if (error) throw new Error('Could not create session: ' + error.message)

  const store = await cookies()
  store.set(APPLICANT_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function getApplicant(): Promise<Applicant | null> {
  const store = await cookies()
  const token = store.get(APPLICANT_COOKIE)?.value
  if (!token) return null

  const supabase = serviceClient()
  const { data: session } = await supabase
    .from('applicant_sessions')
    .select('applicant_id, expires_at, revoked_at')
    .eq('token_hash', sha256(token))
    .maybeSingle()

  if (!session) return null
  if (session.revoked_at) return null
  if (new Date(session.expires_at).getTime() <= Date.now()) return null

  const { data: applicant } = await supabase
    .from('applicants')
    .select('id, legal_first_name, legal_last_name, email, phone, email_verified_at, phone_verified_at')
    .eq('id', session.applicant_id)
    .maybeSingle()

  return (applicant as Applicant) ?? null
}

export function isFullyVerified(applicant: Applicant): boolean {
  return Boolean(applicant.email_verified_at && applicant.phone_verified_at)
}

export async function revokeSession(): Promise<void> {
  const store = await cookies()
  const token = store.get(APPLICANT_COOKIE)?.value
  if (token) {
    await serviceClient()
      .from('applicant_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('token_hash', sha256(token))
  }
  store.delete(APPLICANT_COOKIE)
}

export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return null
}
