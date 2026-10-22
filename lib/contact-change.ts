import { createHash } from 'crypto'
import { sendEmail } from '@/lib/email'
import { sendSms, SMS_COMPLIANCE_SUFFIX } from '@/lib/sms'

/* Changing a family's email or phone: the checks, the change itself, and the
   notices after it. Shared by the desk (app/api/admin/members/contact-change,
   code sent to the OTHER channel) and the family themselves
   (app/api/parent/contact-change, code sent to the NEW address or number;
   owner, 2026-10-22). Rows live in contact_change_requests. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const CODE_TTL_MS = 10 * 60 * 1000
export const MAX_ATTEMPTS = 5

export function normalizePhone(phone: string): string {
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return String(phone).startsWith('+') ? String(phone) : '+' + digits
}
export const hashCode = (c: string) => createHash('sha256').update(String(c).trim()).digest('hex')
export const maskEmail = (e: string) => String(e).replace(/^(.)[^@]*(@.*)$/, '$1•••$2')
export const maskPhone = (p: string) => '•••-•••-' + String(p).replace(/\D/g, '').slice(-4)

export async function applyChange(svc: any, parent: any, field: string, value: string) {
  if (field === 'email') {
    if (parent.auth_user_id) {
      const { error } = await svc.auth.admin.updateUserById(parent.auth_user_id, { email: value, email_confirm: true })
      if (error) return { ok: false, error: `Login account update failed: ${error.message}` }
    }
    const { error } = await svc.from('parents').update({ email: value }).eq('id', parent.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await svc.from('parents').update({ phone: value }).eq('id', parent.id)
    if (error) return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function notifyChange(parent: any, field: string, oldValue: string | null, value: string) {
  try {
    if (field === 'email') {
      if (oldValue) await sendEmail({ type: 'contact_change_notice', to: oldValue, parentName: parent.first_name, changeField: 'email', newValue: value })
      await sendEmail({ type: 'contact_change_notice', to: value, parentName: parent.first_name, changeField: 'email', newValue: value })
    } else {
      if (parent.email) await sendEmail({ type: 'contact_change_notice', to: parent.email, parentName: parent.first_name, changeField: 'phone', newValue: maskPhone(value) })
      // STOP/HELP line (owner, 2026-10-06), as on the sign-up code and the reminder.
      await sendSms(value, 'Manta Shark Aquatics: this is now the phone number on your account. If you did not request this, please contact us right away.' + SMS_COMPLIANCE_SUFFIX)
    }
  } catch {}
}

/* Every refusal the desk can meet carries a `code`; the members screen shows
   its own words for it in the admin's language (found 2026-10-08: a Chinese
   screen showed "Incorrect code." and "Another family already uses this
   phone number."). The English `error` stays for logs. */
export async function validateNewValue(svc: any, parentId: string, field: string, raw: any) {
  if (field !== 'email' && field !== 'phone') return { error: 'Invalid field', code: 'invalid_field' }
  if (!raw || typeof raw !== 'string') return { error: 'Missing new value', code: 'missing_value' }
  const value = field === 'email' ? raw.trim().toLowerCase() : normalizePhone(raw)
  if (field === 'email' && !EMAIL_RE.test(value)) return { error: 'That email address does not look valid.', code: 'bad_email' }
  if (field === 'phone' && value.replace(/\D/g, '').length < 10) return { error: 'That phone number does not look valid.', code: 'bad_phone' }
  if (field === 'email') {
    const { data: dup } = await svc.from('parents').select('id').ilike('email', value).neq('id', parentId).limit(1)
    if (dup && dup.length > 0) return { error: 'Another family already uses this email address.', code: 'email_taken' }
    // auth.users is the real uniqueness constraint — check it before spending a code
    const { data: me } = await svc.from('parents').select('auth_user_id').eq('id', parentId).single()
    const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const taken = (list?.users || []).find((u: any) => String(u.email || '').toLowerCase() === value && u.id !== me?.auth_user_id)
    if (taken) return { error: 'That email already belongs to another login account (family, coach or admin). Pick a different address or remove the old account first.', code: 'email_login_taken' }
  } else {
    const last10 = value.replace(/\D/g, '').slice(-10)
    const { data: dup } = await svc.from('parents').select('id').like('phone', `%${last10}`).neq('id', parentId).limit(1)
    if (dup && dup.length > 0) return { error: 'Another family already uses this phone number.', code: 'phone_taken' }
  }
  return { value }
}

