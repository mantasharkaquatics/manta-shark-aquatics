import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { requireParent } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'
import { sendSms, SMS_COMPLIANCE_SUFFIX } from '@/lib/sms'
import { CODE_TTL_MS, MAX_ATTEMPTS, normalizePhone, hashCode, applyChange, notifyChange, validateNewValue } from '@/lib/contact-change'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* A family changes its own email or phone (owner, 2026-10-22).

   POST { action: 'request_code', field: 'email' | 'phone', new_value }
     -> { ok, request_id }  a 6-digit code goes to the NEW address or number,
        which proves it is theirs and that it was typed right.
   POST { action: 'confirm', request_id, code }
     -> { ok, field, new_value }  the change is made; the old email (and, for
        a phone, the new number) is told, as when the desk changes it.

   Refusals carry `code` for the page's own words. At most 5 codes an hour
   per family, so the form cannot be used to send texts or mail at will. */

const PER_HOUR = 5

export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc } = ctx
  const body = await req.json().catch(() => null) as { action?: string; field?: string; new_value?: string; request_id?: string; code?: string } | null
  if (!body?.action) return NextResponse.json({ error: 'Invalid request', code: 'bad_request' }, { status: 400 })

  const { data: parent } = await svc.from('parents')
    .select('id, first_name, last_name, email, phone, auth_user_id, preferred_language').eq('id', ctx.parent.id).single()
  if (!parent) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })

  if (body.action === 'request_code') {
    const field = body.field
    const v = await validateNewValue(svc, parent.id, String(field || ''), body.new_value)
    if (v.error) return NextResponse.json({ error: v.error, code: v.code }, { status: 400 })
    const value = v.value!
    const current = field === 'email' ? (parent.email || '').toLowerCase() : normalizePhone(parent.phone || '')
    if (current === value) return NextResponse.json({ error: 'That is already on your account.', code: 'same_value' }, { status: 400 })

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await svc.from('contact_change_requests').select('id', { count: 'exact', head: true })
      .eq('parent_id', parent.id).gte('created_at', since)
    if ((count || 0) >= PER_HOUR) return NextResponse.json({ error: 'Too many codes. Try again in an hour.', code: 'too_many_codes' }, { status: 429 })

    await svc.from('contact_change_requests').update({ consumed_at: new Date().toISOString() })
      .eq('parent_id', parent.id).is('consumed_at', null)
    const code = String(randomInt(100000, 1000000))
    const { data: row, error } = await svc.from('contact_change_requests').insert({
      parent_id: parent.id, field, new_value: value, code_hash: hashCode(code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    }).select('id').single()
    if (error || !row) return NextResponse.json({ error: 'Could not start the change.', code: 'server' }, { status: 500 })

    let delivered = false
    if (field === 'email') {
      delivered = await sendEmail({ type: 'contact_verify_code', to: value, parentName: parent.first_name, code, newValue: value, lang: parent.preferred_language || undefined }).catch(() => false)
    } else {
      const r = await sendSms(value, `Manta Shark Aquatics: your code to confirm this phone number is ${code}. It expires in 10 minutes. If you did not ask for this, ignore this message.` + SMS_COMPLIANCE_SUFFIX)
      delivered = r.ok
    }
    if (!delivered) {
      await svc.from('contact_change_requests').update({ consumed_at: new Date().toISOString() }).eq('id', row.id)
      return NextResponse.json({ error: 'The code could not be sent. Check the address or number.', code: 'not_delivered' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, request_id: row.id })
  }

  if (body.action === 'confirm') {
    if (!body.request_id || !body.code) return NextResponse.json({ error: 'Missing code', code: 'missing_code' }, { status: 400 })
    const { data: r } = await svc.from('contact_change_requests').select('*').eq('id', body.request_id).eq('parent_id', parent.id).maybeSingle()
    if (!r || r.consumed_at) return NextResponse.json({ error: 'Send a new code.', code: 'request_used' }, { status: 409 })
    if (new Date(r.expires_at).getTime() < Date.now()) return NextResponse.json({ error: 'That code expired.', code: 'code_expired' }, { status: 409 })
    if (r.attempts >= MAX_ATTEMPTS) return NextResponse.json({ error: 'Too many incorrect attempts.', code: 'too_many_attempts' }, { status: 429 })
    if (hashCode(String(body.code)) !== r.code_hash) {
      await svc.from('contact_change_requests').update({ attempts: r.attempts + 1 }).eq('id', r.id)
      return NextResponse.json({ error: 'Incorrect code.', code: 'incorrect_code' }, { status: 400 })
    }
    // Checked again: another family may have taken the address meanwhile.
    const v = await validateNewValue(svc, parent.id, r.field, r.new_value)
    if (v.error) return NextResponse.json({ error: v.error, code: v.code }, { status: 400 })
    const oldValue = r.field === 'email' ? parent.email : parent.phone
    const applied = await applyChange(svc, parent, r.field, v.value!)
    if (!applied.ok) return NextResponse.json({ error: 'Could not save.', code: 'server' }, { status: 500 })
    await svc.from('contact_change_requests').update({ consumed_at: new Date().toISOString() }).eq('id', r.id)
    await notifyChange(parent, r.field, oldValue, v.value!)
    return NextResponse.json({ ok: true, field: r.field, new_value: v.value })
  }

  return NextResponse.json({ error: 'Unknown action', code: 'bad_request' }, { status: 400 })
}
