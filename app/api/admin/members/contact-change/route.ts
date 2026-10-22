import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { sendSms, SMS_COMPLIANCE_SUFFIX } from '@/lib/sms'
import { isAdultOn, setAccountHolder, setNotAccountHolder } from '@/lib/account-holder'
import { DATE_RE, CODE_TTL_MS, MAX_ATTEMPTS, normalizePhone, hashCode, maskEmail, maskPhone, applyChange, notifyChange, validateNewValue } from '@/lib/contact-change'

export const runtime = 'nodejs'

// Admin-side contact changes with CROSS-CHANNEL verification (owner decision 2026-07-25):
// changing email → code by SMS to the registered phone; changing phone → code by email.
// Address / names / birthday go through direct_update (no verification needed).

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const svc = auth.svc
  const adminId = (auth as any).admin?.id || null

  const body = await req.json().catch(() => null)
  if (!body?.action) return NextResponse.json({ error: 'Invalid request', code: 'bad_request' }, { status: 400 })
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
        if (!n) return NextResponse.json({ error: 'Student name cannot be empty.', code: 'name_required' }, { status: 400 })
        patch.full_name = n
      }
      if ('date_of_birth' in fields) {
        const d = fields.date_of_birth ? String(fields.date_of_birth).trim() : ''
        // The column is NOT NULL (found 2026-10-15): a cleared birthday was
        // written as null, refused by the database, and came back as a plain
        // "save failed" that also lost the name change beside it.
        if (!d) return NextResponse.json({ error: 'Birthday is required.', code: 'birthday_required' }, { status: 400 })
        if (!DATE_RE.test(d)) return NextResponse.json({ error: 'Birthday must be YYYY-MM-DD.', code: 'bad_birthday' }, { status: 400 })
        if (d > new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }))
          return NextResponse.json({ error: 'Birthday cannot be in the future.', code: 'future_birthday' }, { status: 400 })
        patch.date_of_birth = d
      }
      if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
      const { error } = await svc.from('students').update(patch).eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, updated: patch })
    }
    return NextResponse.json({ error: 'Unknown target' }, { status: 400 })
  }

  // ---------- set_account_holder: "this swimmer is the parent" (F15) ----------
  // The desk's copy of the family's own box, for one swimmer. value true makes
  // them the family's one account holder (the others that were true become
  // false); value false says they are NOT -- which also overrides a name match
  // (lib/account-holder.ts accountHolderOf), so unticking always means "not you".
  if (action === 'set_account_holder') {
    const parentId = typeof body.parent_id === 'string' ? body.parent_id : ''
    const studentId = typeof body.student_id === 'string' ? body.student_id : ''
    if (!parentId || !studentId || typeof body.value !== 'boolean') return NextResponse.json({ error: 'Missing fields', code: 'bad_request' }, { status: 400 })
    const { data: st } = await svc.from('students').select('id, parent_id, is_active, date_of_birth').eq('id', studentId).maybeSingle()
    if (!st || st.parent_id !== parentId || !st.is_active) return NextResponse.json({ error: 'Swimmer not found in this family', code: 'student_not_found' }, { status: 404 })
    if (body.value) {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
      if (!isAdultOn(st.date_of_birth, today)) return NextResponse.json({ error: 'Only an adult swimmer (18+) can be the account holder.', code: 'holder_not_adult' }, { status: 400 })
    }
    const r = body.value ? await setAccountHolder(svc, parentId, studentId) : await setNotAccountHolder(svc, parentId, studentId)
    if (r === 'no_column') return NextResponse.json({ error: 'Run docs/migration-account-holder-swimmer.sql first.', code: 'holder_column_missing' }, { status: 409 })
    if (r === 'error') return NextResponse.json({ error: 'Could not save.', code: 'save_failed' }, { status: 500 })
    return NextResponse.json({ ok: true, student_id: studentId, value: body.value })
  }

  // ---------- request_code ----------
  if (action === 'request_code') {
    const { parent_id, field, new_value } = body
    if (!parent_id) return NextResponse.json({ error: 'Missing parent' }, { status: 400 })
    const { data: parent } = await svc.from('parents')
      .select('id, first_name, last_name, email, phone, auth_user_id').eq('id', parent_id).single()
    if (!parent) return NextResponse.json({ error: 'Family not found', code: 'not_found' }, { status: 404 })

    const v = await validateNewValue(svc, parent_id, field, new_value)
    if (v.error) return NextResponse.json({ error: v.error, code: v.code }, { status: 400 })
    const value = v.value!
    const current = field === 'email' ? (parent.email || '').toLowerCase() : normalizePhone(parent.phone || '')
    if (current === value) return NextResponse.json({ error: `That is already the ${field} on file.`, code: 'same_value' }, { status: 400 })

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
    if (insErr || !reqRow) return NextResponse.json({ error: 'Could not create the verification request.', code: 'server' }, { status: 500 })

    let delivered = false
    if (field === 'email') {
      // STOP/HELP line, as on every other text to a family (owner,
      // 2026-10-06); this one went without it (found 2026-10-15).
      const smsResult = await sendSms(normalizePhone(parent.phone),
        `Manta Shark Aquatics: your verification code is ${code}. It expires in 10 minutes. Only share it with our staff if you asked to change your account email.` + SMS_COMPLIANCE_SUFFIX)
      delivered = smsResult.ok
    } else {
      // sendEmail reports a failed send by returning false, not by throwing,
      // so the desk was told the code went out when Resend had refused it.
      try {
        delivered = await sendEmail({ type: 'contact_change_code', to: parent.email, parentName: parent.first_name, code })
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
    if (!request_id || !code) return NextResponse.json({ error: 'Missing code', code: 'missing_code' }, { status: 400 })
    const { data: reqRow } = await svc.from('contact_change_requests').select('*').eq('id', request_id).single()
    if (!reqRow) return NextResponse.json({ error: 'Request not found', code: 'request_used' }, { status: 404 })
    if (reqRow.consumed_at) return NextResponse.json({ error: 'This request was already used or cancelled. Send a new code.', code: 'request_used' }, { status: 409 })
    if (new Date(reqRow.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'That code expired. Send a new one.', code: 'code_expired' }, { status: 409 })
    if (reqRow.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: 'Too many incorrect attempts. Send a new code.', code: 'too_many_attempts' }, { status: 429 })

    if (hashCode(code) !== reqRow.code_hash) {
      const attempts = reqRow.attempts + 1
      await svc.from('contact_change_requests').update({ attempts }).eq('id', request_id)
      return NextResponse.json({ error: 'Incorrect code.', code: 'incorrect_code', attempts_left: Math.max(0, MAX_ATTEMPTS - attempts) }, { status: 400 })
    }

    const { data: parent } = await svc.from('parents')
      .select('id, first_name, last_name, email, phone, auth_user_id').eq('id', reqRow.parent_id).single()
    if (!parent) return NextResponse.json({ error: 'Family not found', code: 'not_found' }, { status: 404 })
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
      return NextResponse.json({ error: 'Please give a reason (at least 10 characters). It is recorded for audit.', code: 'reason_required' }, { status: 400 })
    }
    const { data: parent } = await svc.from('parents')
      .select('id, first_name, last_name, email, phone, auth_user_id').eq('id', parent_id).single()
    if (!parent) return NextResponse.json({ error: 'Family not found', code: 'not_found' }, { status: 404 })

    const v = await validateNewValue(svc, parent_id, field, new_value)
    if (v.error) return NextResponse.json({ error: v.error, code: v.code }, { status: 400 })
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
