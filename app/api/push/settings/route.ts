import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'

/* The three notification switches in My Account (owner, 2026-10-27), per
   person: lesson reports, lesson reminders, booking changes. No row means all
   on. Closures and lessons the school cancels have no switch (lib/push.ts). */

export const runtime = 'nodejs'

const KEYS = ['reports', 'reminders', 'bookings'] as const

export async function GET() {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await auth.svc.from('push_settings').select('reports, reminders, bookings')
    .eq('auth_user_id', auth.user.id).maybeSingle()
  const row = (data || {}) as Record<string, boolean | undefined>
  return NextResponse.json(Object.fromEntries(KEYS.map(k => [k, row[k] !== false])))
}

export async function POST(req: NextRequest) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const patch: Record<string, boolean> = {}
  for (const k of KEYS) if (typeof body[k] === 'boolean') patch[k] = body[k]
  if (!Object.keys(patch).length) return badRequest()
  const { error } = await auth.svc.from('push_settings')
    .upsert({ auth_user_id: auth.user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'auth_user_id' })
  if (error) {
    console.error('push settings not saved:', error.message)
    return NextResponse.json({ error: 'Not saved' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
