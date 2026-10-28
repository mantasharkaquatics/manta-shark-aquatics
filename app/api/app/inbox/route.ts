import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { activeAnnouncements } from '@/lib/announcements'
import { bannerClosures } from '@/lib/closures'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The app's 訊息 screen (owner, 2026-10-28; components/AppInbox.tsx):
   學校公告 (closures + the desk's announcements), 通知 (what the school told
   this person, 90 days -- push_log), and when they last looked at each tab,
   for the red dots. Also the chat's event strips, which are the same notices.

   GET  -> { announcements, closures, notices, seen: { announcements, notices } }
   POST { mark: 'announcements' | 'notices' } -> that tab looked at now. */

const KEEP_DAYS = 90

export async function GET() {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, user } = auth
  const since = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString()
  const [announcements, closures, notices, seen] = await Promise.all([
    activeAnnouncements(svc),
    bannerClosures(svc).catch(() => []),
    svc.from('push_log').select('id, kind, title, body, url, created_at')
      .eq('auth_user_id', user.id).gte('created_at', since).order('created_at', { ascending: false }).limit(150)
      .then(r => (r.error ? [] : r.data || [])),
    svc.from('app_inbox_seen').select('announcements_seen_at, notices_seen_at').eq('auth_user_id', user.id).maybeSingle()
      .then(r => (r.error ? null : r.data)),
  ])
  return NextResponse.json({
    announcements, closures, notices,
    seen: { announcements: seen?.announcements_seen_at ?? null, notices: seen?.notices_seen_at ?? null },
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const col = body?.mark === 'announcements' ? 'announcements_seen_at' : body?.mark === 'notices' ? 'notices_seen_at' : null
  if (!col) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { error } = await auth.svc.from('app_inbox_seen')
    .upsert({ auth_user_id: auth.user.id, [col]: new Date().toISOString() }, { onConflict: 'auth_user_id' })
  if (error) console.warn('[app/inbox] seen not saved', error.message)
  return NextResponse.json({ ok: !error })
}
