import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { emailHasAccount } from '@/lib/account-exists'
import { sendEmail } from '@/lib/email'
import { adminRole, changeLoginEmail, looksLikeEmail, normalizeEmail } from '@/lib/staff-accounts'

/* Manager (admin) accounts, run from the Coaches page (owner, 2026-10-13).
   Only the owner's account (role super_admin) may add, re-address, disable or
   restore managers: an admin account reaches every family's details and money,
   so handing one out stays with the owner. Managers keep managing coaches.

   Disabling moves admins.auth_user_id to disabled_auth_user_id
   (docs/migration-admins-disable.sql). Every admin check in the app matches on
   auth_user_id, so access ends on the very next request without touching any
   of them, and the row stays for the history that names the manager. The
   login is banned too, so they cannot sign in to anything. */

type AdminRow = {
  id: string
  first_name: string
  last_name: string
  email: string
  role: string | null
  auth_user_id: string | null
  disabled_auth_user_id: string | null
}

const BAN_FOREVER = '876000h' // 100 years: Supabase's way of saying "until lifted"

async function owner() {
  const auth = await requireAdmin()
  if (!auth) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const role = await adminRole(auth.svc, auth.admin.id)
  if (role !== 'super_admin') return { res: NextResponse.json({ error: 'Only the owner manages manager accounts', code: 'not_owner' }, { status: 403 }) }
  return { auth, by: `${auth.admin.first_name} ${auth.admin.last_name || ''}`.trim() }
}

function origin(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
}

/** A set-password link for a login, sent as the staff invite. */
async function sendInvite(req: NextRequest, svc: SupabaseClient, email: string, firstName: string, by: string): Promise<boolean> {
  const { data: link, error } = await svc.auth.admin.generateLink({ type: 'recovery', email })
  const token = link?.properties?.hashed_token
  if (error || !token) { console.error('[staff] invite link not made', error); return false }
  return sendEmail({
    type: 'staff_invite', to: email, staffName: firstName, changedBy: by,
    resetUrl: `${origin(req)}/reset-password?token_hash=${encodeURIComponent(token)}`,
  }).catch(() => false)
}

export async function GET() {
  const o = await owner()
  if (o.res) return o.res
  const { auth } = o
  const { data, error } = await auth.svc.from('admins')
    .select('id, first_name, last_name, email, role, auth_user_id, disabled_auth_user_id')
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message, code: 'server' }, { status: 500 })
  const rows = (data || []) as AdminRow[]
  // "Has never signed in" decides whether the row offers to resend the invite.
  const managers = await Promise.all(rows.map(async r => {
    const loginId = r.auth_user_id || r.disabled_auth_user_id
    let signedIn: boolean | null = null
    if (loginId) {
      const { data: u } = await auth.svc.auth.admin.getUserById(loginId)
      signedIn = u?.user ? !!u.user.last_sign_in_at : null
    }
    return {
      id: r.id, first_name: r.first_name, last_name: r.last_name, email: r.email,
      owner: r.role === 'super_admin',
      active: !!r.auth_user_id,
      signed_in: signedIn,
      me: r.id === auth.admin.id,
    }
  }))
  return NextResponse.json({ managers })
}

// Add a manager: the login, the admins row, then the set-password email.
export async function POST(req: NextRequest) {
  const o = await owner()
  if (o.res) return o.res
  const { auth, by } = o
  const body = await readJson(req)
  if (!body) return badRequest()
  const first = String(body.first_name || '').trim()
  const last = String(body.last_name || '').trim()
  const email = normalizeEmail(body.email)
  if (!first || !last || !email) return NextResponse.json({ error: 'Name and email are required', code: 'missing_fields' }, { status: 400 })
  if (!looksLikeEmail(email)) return NextResponse.json({ error: 'Not an email address', code: 'bad_email' }, { status: 400 })

  const taken = await emailHasAccount(auth.svc, email)
  if (taken === null) return NextResponse.json({ error: 'Lookup failed', code: 'server' }, { status: 500 })
  if (taken) return NextResponse.json({ error: 'Email already has an account', code: 'email_taken' }, { status: 409 })

  const { data: created, error: authErr } = await auth.svc.auth.admin.createUser({ email, email_confirm: true })
  if (authErr || !created?.user) {
    const dup = /already|registered|exists/i.test(authErr?.message || '')
    return NextResponse.json({ error: 'Login not created', code: dup ? 'email_taken' : 'server' }, { status: dup ? 409 : 500 })
  }
  const { data: row, error: rowErr } = await auth.svc.from('admins').insert({
    first_name: first, last_name: last, email, role: 'admin', auth_user_id: created.user.id,
  }).select('id').single()
  if (rowErr || !row) {
    await auth.svc.auth.admin.deleteUser(created.user.id) // nothing half-made
    return NextResponse.json({ error: 'Manager not created', code: 'server' }, { status: 500 })
  }
  const invited = await sendInvite(req, auth.svc, email, first, by)
  return NextResponse.json({ ok: true, id: (row as { id: string }).id, invited })
}

// action: 'email' (with email) | 'disable' | 'enable' | 'resend_invite'
export async function PATCH(req: NextRequest) {
  const o = await owner()
  if (o.res) return o.res
  const { auth, by } = o
  const body = await readJson(req)
  if (!body?.id || !body?.action) return badRequest()
  const { data, error } = await auth.svc.from('admins')
    .select('id, first_name, last_name, email, role, auth_user_id, disabled_auth_user_id')
    .eq('id', body.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message, code: 'server' }, { status: 500 })
  const row = data as AdminRow | null
  if (!row) return NextResponse.json({ error: 'Manager not found' }, { status: 404 })

  if (body.action === 'email') {
    if (!row.auth_user_id) return NextResponse.json({ error: 'Restore the account first', code: 'disabled' }, { status: 409 })
    const r = await changeLoginEmail(auth.svc, row.auth_user_id, body.email, by)
    if (!r.ok) return NextResponse.json({ error: 'Email not changed', code: r.code }, { status: r.status })
    return NextResponse.json({ ok: true, email: r.newEmail })
  }

  if (body.action === 'disable') {
    if (row.id === auth.admin.id) return NextResponse.json({ error: 'You cannot disable yourself', code: 'self' }, { status: 409 })
    if (row.role === 'super_admin') return NextResponse.json({ error: 'The owner account cannot be disabled', code: 'owner' }, { status: 409 })
    if (!row.auth_user_id) return NextResponse.json({ ok: true }) // already off
    // A login that is also a coach's would lose the coach portal too; that
    // is the coach list's switch, not this one.
    const { data: coach } = await auth.svc.from('coaches').select('id').eq('auth_user_id', row.auth_user_id).limit(1)
    if (coach && coach.length > 0) return NextResponse.json({ error: 'This login is also a coach', code: 'also_coach' }, { status: 409 })
    const loginId = row.auth_user_id
    const { error: upErr } = await auth.svc.from('admins')
      .update({ auth_user_id: null, disabled_auth_user_id: loginId }).eq('id', row.id)
    if (upErr) return NextResponse.json({ error: upErr.message, code: 'server' }, { status: 500 })
    // The row change is what revokes access; the ban only stops new sign-ins.
    const { error: banErr } = await auth.svc.auth.admin.updateUserById(loginId, { ban_duration: BAN_FOREVER })
    if (banErr) console.error('[staff] access removed but the login was not banned', banErr)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'enable') {
    if (row.auth_user_id) return NextResponse.json({ ok: true }) // already on
    const loginId = row.disabled_auth_user_id
    if (!loginId) return NextResponse.json({ error: 'No login to restore', code: 'no_login' }, { status: 409 })
    const { error: banErr } = await auth.svc.auth.admin.updateUserById(loginId, { ban_duration: 'none' })
    if (banErr) return NextResponse.json({ error: banErr.message, code: 'server' }, { status: 500 })
    const { error: upErr } = await auth.svc.from('admins')
      .update({ auth_user_id: loginId, disabled_auth_user_id: null }).eq('id', row.id)
    if (upErr) return NextResponse.json({ error: upErr.message, code: 'server' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'resend_invite') {
    if (!row.auth_user_id) return NextResponse.json({ error: 'Restore the account first', code: 'disabled' }, { status: 409 })
    const ok = await sendInvite(req, auth.svc, row.email, row.first_name, by)
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Invite not sent', code: 'server' }, { status: 502 })
  }

  return badRequest('Unknown action')
}
