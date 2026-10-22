import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { alertAdmin } from '@/lib/admin-alert'
import { sendSms } from '@/lib/sms'
import { SITE_URL } from '@/lib/site-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Account self-service on My Account (owner, 2026-10-22, tier 3).

   GET                                   -> { media, mediaAt, deletionRequestedAt, main }
   POST { action: 'media', value: bool } -> photo and video consent on or off
   POST { action: 'delete_request' }     -> asks the school to delete the account
   POST { action: 'delete_withdraw' }    -> takes that request back

   Media: parents.media_release_accepted, and media_release_at is when the
   family last said yes or no, so a withdrawal is on record (admin Members
   shows it). A second guardian may change it (same rights as the main
   account).

   Deletion is a request, not a delete: the desk settles unused points,
   future lessons and any team subscription with the family first (refunds
   wait on the lawyer). The desk is told by email and text. Only the main
   account asks or withdraws. Needs docs/migration-tier3.sql. */

export async function GET() {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { data } = await ctx.svc.from('parents').select('media_release_accepted, media_release_at').eq('id', ctx.parent.id).maybeSingle()
  const { data: del, error } = await ctx.svc.from('parents').select('deletion_requested_at').eq('id', ctx.parent.id).maybeSingle()
  return NextResponse.json({
    media: !!data?.media_release_accepted, mediaAt: data?.media_release_at || null,
    deletionRequestedAt: error ? null : del?.deletion_requested_at || null,
    deletionAvailable: !error, main: !ctx.guardianId,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = ctx
  const b = await req.json().catch(() => null) as { action?: string; value?: unknown } | null
  const now = new Date().toISOString()

  if (b?.action === 'media') {
    if (typeof b.value !== 'boolean') return NextResponse.json({ error: 'Invalid request', code: 'bad_request' }, { status: 400 })
    const { error } = await svc.from('parents').update({ media_release_accepted: b.value, media_release_at: now }).eq('id', parent.id)
    if (error) return NextResponse.json({ error: 'Could not save', code: 'server' }, { status: 500 })
    return NextResponse.json({ ok: true, media: b.value, mediaAt: now })
  }

  if (b?.action === 'delete_request' || b?.action === 'delete_withdraw') {
    if (ctx.guardianId) return NextResponse.json({ error: 'Only the main account can do this', code: 'not_main' }, { status: 403 })
    const asking = b.action === 'delete_request'
    const q = svc.from('parents').update({ deletion_requested_at: asking ? now : null }).eq('id', parent.id)
    const { data, error } = await (asking ? q.is('deletion_requested_at', null) : q.not('deletion_requested_at', 'is', null)).select('first_name, last_name')
    if (error) return NextResponse.json({ error: 'Not available yet', code: 'unavailable' }, { status: 503 })
    if (data && data.length) {
      const who = `${data[0].first_name || ''} ${data[0].last_name || ''}`.trim() || 'A family'
      const link = `${SITE_URL}/admin/members`
      await Promise.allSettled([
        alertAdmin(asking ? `Account deletion requested: ${who}` : `Deletion request withdrawn: ${who}`, asking
          ? [`${who} asked for their account to be deleted (My Account).`,
             'Before deleting, settle with them: unused points, future lessons, any Swim Team subscription.',
             `Members: ${link}`]
          : [`${who} withdrew their request to delete the account. Nothing to do.`]),
        asking && process.env.ADMIN_ALERT_PHONE
          ? sendSms(process.env.ADMIN_ALERT_PHONE, `Manta Shark: ${who} asked for their account to be deleted. Details by email; Members: ${link}`)
          : Promise.resolve(null),
      ])
    }
    return NextResponse.json({ ok: true, deletionRequestedAt: asking ? now : null })
  }

  return NextResponse.json({ error: 'Invalid request', code: 'bad_request' }, { status: 400 })
}
