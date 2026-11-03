import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { disconnect } from '@/lib/google-calendar'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* Stop syncing to this person's Google Calendar: the "Manta Shark 課程"
   calendar we made is deleted (every lesson in it goes) and the link is
   forgotten (lib/google-calendar.ts). POST */
export async function POST() {
  const ctx = await requireParent({ viewer: true })
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    await disconnect(ctx.svc, ctx.parent.id, ctx.user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('google calendar disconnect failed:', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not disconnect' }, { status: 500 })
  }
}
