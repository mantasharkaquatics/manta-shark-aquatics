/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { emailHasAccount } from '@/lib/account-exists'
import { looksLikeEmail, normalizeEmail } from '@/lib/staff-accounts'
import { familyGuardians, removeGuardian, sendGuardianInvite, MAX_GUARDIANS } from '@/lib/guardians'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The family's second guardian (lib/guardians.ts, owner 2026-10-22).

   GET                                     -> { me: 'main' | 'guardian', guardians, available }
   POST { first_name, last_name, email }   -> invite (main account only)
   PATCH { id, action: 'resend' }          -> send the invitation again
   DELETE ?id=                             -> remove them (main account only)

   A guardian may read the list (to see who else is on the account) but not
   change it. `available: false` until docs/migration-guardians.sql has run. */

const bad = (code: string, error: string, status = 400) => NextResponse.json({ error, code }, { status })
const origin = (req: NextRequest) => process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin
const RESEND_GAP_MS = 60_000

export async function GET() {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const guardians = await familyGuardians(ctx.svc, ctx.parent.id)
  return NextResponse.json({
    me: ctx.guardianId ? 'guardian' : 'main',
    myGuardianId: ctx.guardianId,
    guardians: guardians || [],
    available: guardians !== null,
    max: MAX_GUARDIANS,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

async function mainOnly() {
  const ctx = await requireParent()
  if (!ctx) return { res: NextResponse.json({ error: 'Not authorized' }, { status: 401 }) }
  if (ctx.guardianId) return { res: bad('not_main', 'Only the main account can do this', 403) }
  return { ctx }
}

async function familyRow(svc: any, parentId: string) {
  const { data } = await svc.from('parents').select('id, first_name, last_name, email, preferred_language').eq('id', parentId).single()
  return data
}

export async function POST(req: NextRequest) {
  const m = await mainOnly()
  if (m.res) return m.res
  const { svc, parent } = m.ctx
  const b = await req.json().catch(() => null) as any
  const first = String(b?.first_name || '').trim().slice(0, 60)
  const last = String(b?.last_name || '').trim().slice(0, 60)
  const email = normalizeEmail(b?.email)
  if (!first || !last || !email) return bad('missing_fields', 'Name and email are required')
  if (!looksLikeEmail(email)) return bad('bad_email', 'Not an email address')

  const current = await familyGuardians(svc, parent.id)
  if (current === null) return bad('unavailable', 'Not available yet', 503)
  if (current.length >= MAX_GUARDIANS) return bad('limit', 'This account already has a second guardian', 409)
  const taken = await emailHasAccount(svc, email)
  if (taken === null) return bad('server', 'Lookup failed', 500)
  if (taken) return bad('email_taken', 'That email already has an account', 409)

  const { data: created, error: authErr } = await svc.auth.admin.createUser({
    email, email_confirm: true, user_metadata: { first_name: first, last_name: last, guardian: true },
  })
  if (authErr || !created?.user) {
    const dup = /already|registered|exists/i.test(authErr?.message || '')
    return bad(dup ? 'email_taken' : 'server', 'Login not created', dup ? 409 : 500)
  }
  const { data: row, error: rowErr } = await svc.from('parent_guardians').insert({
    parent_id: parent.id, auth_user_id: created.user.id, email, first_name: first, last_name: last,
  }).select('id').single()
  if (rowErr || !row) {
    await svc.auth.admin.deleteUser(created.user.id) // nothing half-made
    return bad(rowErr?.code === '23505' ? 'email_taken' : 'server', 'Guardian not added', rowErr?.code === '23505' ? 409 : 500)
  }
  const fam = await familyRow(svc, parent.id)
  const invited = await sendGuardianInvite(svc, origin(req), { email, first_name: first }, fam)
  return NextResponse.json({ ok: true, id: row.id, invited })
}

export async function PATCH(req: NextRequest) {
  const m = await mainOnly()
  if (m.res) return m.res
  const { svc, parent } = m.ctx
  const b = await req.json().catch(() => null) as any
  if (b?.action !== 'resend') return bad('bad_request', 'Invalid request')
  const { data: g } = await svc.from('parent_guardians').select('id, email, first_name, auth_user_id')
    .eq('id', String(b.id || '')).eq('parent_id', parent.id).is('removed_at', null).maybeSingle()
  if (!g || !g.auth_user_id) return bad('not_found', 'Not found', 404)
  const { data: u } = await svc.auth.admin.getUserById(g.auth_user_id)
  const lastSent = (u?.user as any)?.recovery_sent_at
  if (lastSent && Date.now() - new Date(lastSent).getTime() < RESEND_GAP_MS) return bad('too_soon', 'Wait a minute before sending again', 429)
  const fam = await familyRow(svc, parent.id)
  const invited = await sendGuardianInvite(svc, origin(req), g, fam)
  return invited ? NextResponse.json({ ok: true }) : bad('server', 'Could not send the email', 502)
}

export async function DELETE(req: NextRequest) {
  const m = await mainOnly()
  if (m.res) return m.res
  const { svc, parent } = m.ctx
  const id = req.nextUrl.searchParams.get('id') || ''
  const { data: g } = await svc.from('parent_guardians').select('id, auth_user_id')
    .eq('id', id).eq('parent_id', parent.id).is('removed_at', null).maybeSingle()
  if (!g) return bad('not_found', 'Not found', 404)
  if (!(await removeGuardian(svc, g))) return bad('server', 'Could not remove', 500)
  return NextResponse.json({ ok: true })
}
