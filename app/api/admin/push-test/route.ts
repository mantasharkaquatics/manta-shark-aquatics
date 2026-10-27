/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { pushConfigured } from '@/lib/push'
import { pushTest } from '@/lib/push-text'

export const runtime = 'nodejs'

/* The phone app on the admin family page (owner, 2026-10-27).
   GET: which phones of this family have the app -- whose, iPhone or
   Android, notifications allowed, last opened. Never the token.
   POST: send them the test notice (lib/push-text.ts pushTest). */

type Phone = { platform: string; permission: boolean; lastSeen: string; who: 'main' | 'full' | 'viewer' | 'gone' }

async function phonesOf(svc: any, parentId: string): Promise<Phone[]> {
  const [{ data: p }, { data: devs }] = await Promise.all([
    svc.from('parents').select('auth_user_id').eq('id', parentId).maybeSingle(),
    svc.from('push_devices').select('platform, permission, last_seen_at, auth_user_id')
      .eq('parent_id', parentId).order('last_seen_at', { ascending: false }),
  ])
  if (!devs?.length) return []
  // Before docs/migration-guardian-roles.sql there is no role column.
  const live = (cols: string) => svc.from('parent_guardians').select(cols)
    .eq('parent_id', parentId).is('removed_at', null).not('auth_user_id', 'is', null)
  const first = await live('auth_user_id, role')
  const { data: g } = first.error ? await live('auth_user_id') : first
  const roleOf = new Map<string, Phone['who']>((g || []).map((r: any) => [r.auth_user_id, r.role === 'viewer' ? 'viewer' : 'full']))
  if (p?.auth_user_id) roleOf.set(p.auth_user_id, 'main')
  return devs.map((d: any) => ({
    platform: d.platform, permission: !!d.permission, lastSeen: d.last_seen_at,
    who: roleOf.get(d.auth_user_id) || 'gone',
  }))
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parentId = req.nextUrl.searchParams.get('parent_id') || ''
  if (!parentId) return NextResponse.json({ error: 'Missing parent_id' }, { status: 400 })
  return NextResponse.json({ configured: pushConfigured(), phones: await phonesOf(auth.svc, parentId) })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const parentId = typeof body?.parent_id === 'string' ? body.parent_id : ''
  if (!parentId) return NextResponse.json({ error: 'Missing parent_id' }, { status: 400 })
  if (!pushConfigured()) return NextResponse.json({ error: 'not_configured' }, { status: 503 })
  const sent = await pushTest(auth.svc, parentId)
  return NextResponse.json({ sent, phones: await phonesOf(auth.svc, parentId) })
}
