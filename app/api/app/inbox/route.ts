import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { activeAnnouncements } from '@/lib/announcements'
import { bannerClosures } from '@/lib/closures'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The app's 訊息 screen (owner, 2026-10-28; app/(public)/dashboard/chat):
   通知 (closures, the desk's announcements, and what the school told this
   person, 90 days -- push_log), when they last looked at each, and how many
   chat replies they have not read, for the red dots. Also the chat's event
   strips, which are the same notices.

   GET  -> { announcements, closures, notices, seen: { announcements, notices }, chat }
   GET ?summary=1 -> { notices: boolean, chat: number } -- just the red dots,
        for the app's 訊息 tab on every page (components/AppShell).
   POST { mark: 'announcements' | 'notices' } -> that tab looked at now. */

const KEEP_DAYS = 90

/** Desk and AI replies in the family's chat newer than the family last read it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function chatUnread(svc: any, parentId: string): Promise<number> {
  const { data: th, error } = await svc.from('chat_threads').select('id, parent_last_read_at')
    .eq('parent_id', parentId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (error || !th) return 0
  let q = svc.from('chat_messages').select('id', { count: 'exact', head: true })
    .eq('thread_id', th.id).in('sender_type', ['admin', 'ai']).is('recalled_at', null)
  if (th.parent_last_read_at) q = q.gt('created_at', th.parent_last_read_at)
  const { count } = await q
  return count || 0
}

export async function GET(req: NextRequest) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, user } = auth
  const since = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString()

  if (req.nextUrl.searchParams.get('summary')) {
    const [seen, closures, announcements, chat] = await Promise.all([
      svc.from('app_inbox_seen').select('announcements_seen_at, notices_seen_at').eq('auth_user_id', user.id).maybeSingle()
        .then(r => (r.error ? null : r.data)),
      bannerClosures(svc).catch(() => []),
      activeAnnouncements(svc).catch(() => []),
      chatUnread(svc, auth.parent.id).catch(() => 0),
    ])
    let nq = svc.from('push_log').select('id', { count: 'exact', head: true }).eq('auth_user_id', user.id).gte('created_at', since)
    if (seen?.notices_seen_at) nq = nq.gt('created_at', seen.notices_seen_at)
    const { count: newNotices } = await nq
    const annSeen = seen?.announcements_seen_at ?? null
    const notices = (newNotices || 0) > 0
      || (announcements as { created_at: string }[]).some(a => !annSeen || a.created_at > annSeen)
      || ((closures as unknown[]).length > 0 && !annSeen)
    return NextResponse.json({ notices, chat })
  }

  const [announcements, closures, notices, seen] = await Promise.all([
    activeAnnouncements(svc),
    bannerClosures(svc).catch(() => []),
    svc.from('push_log').select('id, kind, title, body, url, created_at')
      .eq('auth_user_id', user.id).gte('created_at', since).order('created_at', { ascending: false }).limit(150)
      .then(r => (r.error ? [] : r.data || [])),
    svc.from('app_inbox_seen').select('announcements_seen_at, notices_seen_at').eq('auth_user_id', user.id).maybeSingle()
      .then(r => (r.error ? null : r.data)),
  ])
  const chat = await chatUnread(svc, auth.parent.id).catch(() => 0)
  return NextResponse.json({
    announcements, closures, notices, chat,
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
