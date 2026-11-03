import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { disconnect } from '@/lib/google-calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Stop syncing to one of this person's Google accounts: the "Manta Shark
   課程" calendar we made there is deleted (every lesson in it goes) and the
   link is forgotten (lib/google-calendar.ts). POST { id } -- the link's id
   from GET /api/parent/calendar-feed (googleAccounts). */
export async function POST(req: NextRequest) {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const id = typeof body?.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null
  if (!id) return NextResponse.json({ error: 'Which account?' }, { status: 400 })
  try {
    await disconnect(ctx.svc, ctx.parent.id, ctx.user.id, id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('google calendar disconnect failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not disconnect' }, { status: 500 })
  }
}
