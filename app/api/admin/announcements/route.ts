import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { allAnnouncements, pushAnnouncement } from '@/lib/announcements'

export const runtime = 'nodejs'

/* Admin > 公告 (owner, 2026-10-28; lib/announcements.ts).
   GET -> { announcements }
   POST { title, body, pinned?, expires_at?, push? } -> { announcement, pushed }
   DELETE ?id= -> taken down (kept, with deleted_at). */

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ announcements: await allAnnouncements(auth.svc) })
  } catch (e) {
    console.error('[admin/announcements] read', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const title = typeof b?.title === 'string' ? b.title.trim() : ''
  const body = typeof b?.body === 'string' ? b.body.trim() : ''
  if (!title || title.length > 120 || body.length > 4000) return NextResponse.json({ error: 'Bad request', code: 'invalid' }, { status: 400 })
  let expires: string | null = null
  if (typeof b?.expires_at === 'string' && b.expires_at) {
    const d = new Date(b.expires_at)
    if (isNaN(d.getTime()) || d.getTime() < Date.now()) return NextResponse.json({ error: 'Bad request', code: 'bad_expiry' }, { status: 400 })
    expires = d.toISOString()
  }
  const { data: row, error } = await auth.svc.from('announcements')
    .insert({ title, body, pinned: !!b?.pinned, expires_at: expires, created_by: auth.user.id })
    .select('*').single()
  if (error || !row) {
    console.error('[admin/announcements] insert', error?.message)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  let pushed: number | null = null
  if (b?.push) {
    pushed = await pushAnnouncement(auth.svc, { title, body })
    await auth.svc.from('announcements').update({ pushed_at: new Date().toISOString(), push_count: pushed }).eq('id', row.id)
  }
  return NextResponse.json({ announcement: { ...row, push_count: pushed }, pushed })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { error } = await auth.svc.from('announcements').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null)
  if (error) {
    console.error('[admin/announcements] delete', error.message)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
