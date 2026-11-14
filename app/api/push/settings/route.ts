import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { SOON_CHOICES, SOON_DEFAULT } from '@/lib/lesson-soon'

/* The notification switches under 我的 (owner, 2026-10-27), per person:
   lesson reports, lesson reminders, booking changes -- on unless turned off
   -- and school news (2026-10-28), off unless turned on (Apple 4.5.4).
   Closures and lessons the school cancels have no switch (lib/push.ts).
   soon (2026-11-14): how long before a lesson its push comes -- 0 (none),
   30 or 60 minutes, 60 when not chosen (lib/lesson-soon.ts). */

export const runtime = 'nodejs'

const KEYS = ['reports', 'reminders', 'bookings', 'news'] as const

export async function GET() {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data } = await auth.svc.from('push_settings').select('*')
    .eq('auth_user_id', auth.user.id).maybeSingle()
  const row = (data || {}) as Record<string, boolean | number | undefined>
  const soon = typeof row.soon_minutes === 'number' ? row.soon_minutes : SOON_DEFAULT
  // The role too: what a family member gets differs from the main account (J85).
  return NextResponse.json({ ...Object.fromEntries(KEYS.map(k => [k, k === 'news' ? row[k] === true : row[k] !== false])), soon, role: auth.role ?? null })
}

export async function POST(req: NextRequest) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const patch: Record<string, boolean | number> = {}
  for (const k of KEYS) if (typeof body[k] === 'boolean') patch[k] = body[k]
  if (typeof body.soon === 'number' && (SOON_CHOICES as readonly number[]).includes(body.soon)) patch.soon_minutes = body.soon
  if (!Object.keys(patch).length) return badRequest()
  const { error } = await auth.svc.from('push_settings')
    .upsert({ auth_user_id: auth.user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'auth_user_id' })
  if (error) {
    console.error('push settings not saved:', error.message)
    return NextResponse.json({ error: 'Not saved' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
