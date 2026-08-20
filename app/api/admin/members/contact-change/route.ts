import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomInt } from 'crypto'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { sendSms } from '@/lib/sms'

export const runtime = 'nodejs'

// Admin-side contact changes with CROSS-CHANNEL verification (owner decision 2026-07-25):
// changing email → code by SMS to the registered phone; changing phone → code by email.
// Address / names / birthday go through direct_update (no verification needed).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5

function normalizePhone(phone: string): string {
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length === 10) return '+1' + digits
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits
  return String(phone).startsWith('+') ? String(phone) : '+' + digits
}
const hashCode = (c: string) => createHash('sha256').update(String(c).trim()).digest('hex')
const maskEmail = (e: string) => String(e).replace(/^(.)[^@]*(@.*)$/, '$1•••$2')
const maskPhone = (p: string) => '•••-•••-' + String(p).replace(/\D/g, '').slice(-4)

async function applyChange(svc: any, parent: any, field: string, value: string) {
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

async function notifyChange(parent: any, field: string, oldValue: string | null, value: string) {
  try {
    if (field === 'email') {
      if (oldValue) await sendEmail({ type: 'contact_change_notice', to: oldValue, parentName: parent.first_name, changeField: 'email', newValue: value })
      await sendEmail({ type: 'contact_change_notice', to: value, parentName: parent.first_name, changeField: 'email', newValue: value })
    } else {
      if (parent.email) await sendEmail({ type: 'contact_change_notice', to: parent.email, parentName: parent.first_name, changeField: 'phone', newValue: maskPhone(value) })
      await sendSms(value, 'Manta Shark Aquatics: this is now the phone number on your account. If you did not request this, please contact us right away.')
    }
  } catch {}
}

async function validateNewValue(svc: any, parentId: string, field: string, raw: any) {
  if (field !== 'email' && field !== 'phone') return { error: 'Invalid field' }
  if (!raw || typeof raw !== 'string') return { error: 'Missing new value' }
  const value = field === 'email' ? raw.trim().toLowerCase() : normalizePhone(raw)
  if (field === 'email' && !EMAIL_RE.test(value)) return { error: 'That email address does not look valid.' }
  if (field === 'phone' && value.replace(/\D/g, '').length < 10) return { error: 'That phone number does not look valid.' }
  if (field === 'email') {
    const { data: dup } = await svc.from('parents').select('id').ilike('email', value).neq('id', parentId).limit(1)
    if (dup && dup.length > 0) return { error: 'Another family already uses this email address.' }
    // auth.users is the real uniqueness constraint — check it before spending a code
    const { data: me } = await svc.from('parents').select('auth_user_id').eq('id', parentId).single()
    const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const taken = (list?.users || []).find((u: any) => String(u.email || '').toLowerCase() === value && u.id !== me?.auth_user_id)
    if (taken) return { error: 'That email already belongs to another login account (family, coach or admin). Pick a different address or remove the old account first.' }
  } else {
    const last10 = value.replace(/\D/g, '').slice(-10)
    const { data: dup } = await svc.from('parents').select('id').like('phone', `%${last10}`).neq('id', parentId).limit(1)
    if (dup && dup.length > 0) return { error: 'Another family already uses this phone number.' }
  }
  return { value }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const adminId = (auth as any).admin?.id || null

  const body = await req.json().catch(() => null)
  if (!body?.action) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { action } = body

  // ---------- direct_update: address / names / birthday, no verification ----------
  if (action === 'direct_update') {
    const { target, id, fields } = body
    if (!id || !fields || typeof fields !== 'object') return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    if (target === 'parent') {
      const allowed = ['first_name', 'last_name', 'address_line1', 'address_line2', 'city', 'state', 'zip_code']
      const patch: Record<string, any> = {}
      for (const k of allowed) if (k in fields) patch[k] = typeof fields[k] === 'string' ? (fields[k].trim() || null) : fields[k]
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
      const { error } = await svc.from('parents').update(patch).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, updated: patch })
    }
    if (target === 'student') {
      const patch: Record<string, any> = {}
      if ('full_name' in fields) {
        const n = String(fields.full_name || '').trim()
        if (!n) return NextResponse.json({ error: 'Student name cannot be empty.' }, { status: 400 })
        patch.full_name = n
      }
      if ('date_of_birth' in fields) {
        const d = fields.date_of_birth ? String(fields.date_of_birth).trim() : ''
        if (d && !DATE_RE.test(d)) return NextResponse.json({ error: 'Birthday must be YYYY-MM-DD.' }, { status: 400 })
        patch.date_of_birth = d || null
      }
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
      const { error } = await svc.from('students').update(patch).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, updated: patch })
    }
    return NextResponse.json({ error: 'Unknown target' }, { status: 400 })
  }

  // ---------- request_code ----------
  if (action === 'request_code') {
    const { parent_id, field, new_value } = body
    if (!parent_id) return NextResponse.json({ error: 'Missing parent' }, { status: 400 })
    const { data: parent } = await svc.from('parents')
      .select('id, first_name, last_name, email, phone, auth_user_id').eq('id', parent_id).single()
    if (!parent) return NextResponse.json({ error: 'Family not found' }, { status: 404 })

    const v = await validateNewValue(svc, parent_id, field, new_value)
    if (v.error) return NextResponse.json({ error: v.error }, { status: 400 })
    const value = v.value!
    const current = field === 'email' ? (parent.email || '').toLowerCase() : normalizePhone(parent.phone || '')
    if (current === value) return NextResponse.json({ error: `That is already the ${field} on file.` }, { status: 400 })

    const channel = field === 'email' ? parent.phone : parent.email
    if (!channel) {
      return NextResponse.json({
        error: 'no_channel',
        message: `This family has no ${field === 'email' ? 'phone number' : 'email address'} on file to verify against. Use the override option after checking ID.`,
      }, { status: 409 })
    }

    await svc.from('contact_change_requests')
      .update({ consumed_at: new Date().toISOString() })
      .eq('parent_id', parent_id).is('consumed_at', null)

    const code = String(randomInt(100000, 1000000))
    const { data: reqRow, error: insErr } = await svc.from('contact_change_requests').insert({
      parent_id, field, new_value: value,
      code_hash: hashCode(code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    }).select('id').single()
    if (insErr || !reqRow) return NextResponse.json({ error: 'Could not create the verification request.' }, { status: 500 })

    let delivered = false
    if (field === 'email') {
      const smsResult = await sendSms(normalizePhone(parent.phone),
        `Manta Shark Aquatics: your verification code is ${code}. It expires in 10 minutes. Only share it with our staff if you asked to change your account email.`)
      delivered = smsResult.ok
    } else {
      try {
        await sendEmail({ type: 'contact_change_code', to: parent.email, parentName: parent.first_name, code })
        delivered = true
      } catch {}
    }

    return NextResponse.json({
      ok: true, request_id: reqRow.id, delivered,
      sent_to: field === 'email' ? maskPhone(parent.phone) : maskEmail(parent.email),
    })
  }

  // ---------- confirm ----------
  if (action === 'confirm') {
    const { request_id, code } = body
    if (!request_id || !code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })
    const { data: reqRow } = await svc.from('contact_change_requests').select('*').eq('id', request_id).single()
    if (!reqRow) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (reqRow.consumed_at) return NextResponse.json({ error: 'This request was already used or cancelled. Send a new code.' }, { status: 409 })
    if (new Date(reqRow.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'That code expired. Send a new one.' }, { status: 409 })
    if (reqRow.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: 'Too many incorrect attempts. Send a new code.' }, { status: 429 })

    if (hashCode(code) !== reqRow.code_hash) {
      const attempts = reqRow.attempts + 1
      await svc.from('contact_change_requests').update({ attempts }).eq('id', request_id)
      return NextResponse.json({ error: 'Incorrect code.', attempts_left: Math.max(0, MAX_ATTEMPTS - attempts) }, { status: 400 })
    }

    const { data: parent } = await svc.from('parents')
      .select('id, first_name, last_name, email, phone, auth_user_id').eq('id', reqRow.parent_id).single()
    if (!parent) return NextResponse.json({ error: 'Family not found' }, { status: 404 })
    const oldValue = reqRow.field === 'email' ? parent.email : parent.phone

    const applied = await applyChange(svc, parent, reqRow.field, reqRow.new_value)
    if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 500 })

    await svc.from('contact_change_requests')
      .update({ consumed_at: new Date().toISOString(), performed_by: adminId }).eq('id', request_id)
    await notifyChange(parent, reqRow.field, oldValue, reqRow.new_value)

    return NextResponse.json({ ok: true, field: reqRow.field, new_value: reqRow.new_value })
  }

  // ---------- force_update: both channels dead, ID checked at the desk ----------
  if (action === 'force_update') {
    const { parent_id, field, new_value, reason } = body
    if (!parent_id) return NextResponse.json({ error: 'Missing parent' }, { status: 400 })
    if (!reason || String(reason).trim().length < 10) {
      return NextResponse.json({ error: 'Please give a reason (at least 10 characters). It is recorded for audit.' }, { status: 400 })
    }
    const { data: parent } = await svc.from('parents')
      .select('id, first_name, last_name, email, phone, auth_user_id').eq('id', parent_id).single()
    if (!parent) return NextResponse.json({ error: 'Family not found' }, { status: 404 })

    const v = await validateNewValue(svc, parent_id, field, new_value)
    if (v.error) return NextResponse.json({ error: v.error }, { status: 400 })
    const value = v.value!
    const oldValue = field === 'email' ? parent.email : parent.phone

    const applied = await applyChange(svc, parent, field, value)
    if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 500 })

    await svc.from('contact_change_requests').insert({
      parent_id, field, new_value: value,
      code_hash: 'forced',
      expires_at: new Date().toISOString(),
      consumed_at: new Date().toISOString(),
      forced_reason: String(reason).trim(),
      performed_by: adminId,
    })
    await notifyChange(parent, field, oldValue, value)

    return NextResponse.json({ ok: true, forced: true, field, new_value: value })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
