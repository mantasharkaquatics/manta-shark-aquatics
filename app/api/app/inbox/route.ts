import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { activeAnnouncements } from '@/lib/announcements'
import { bannerClosures } from '@/lib/closures'
import { chatUnread, inboxCounts, INBOX_KEEP_DAYS } from '@/lib/app-inbox-count'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The app's 訊息 screen (owner, 2026-10-28; app/(public)/dashboard/chat):
   通知 (closures, the desk's announcements, and what the school told this
   person, 90 days -- push_log), when they last looked at each, and how many
   chat replies they have not read, for the red dots. Also the chat's event
   strips, which are the same notices.

   GET  -> { announcements, closures, notices, seen: { announcements, notices }, chat }
   GET ?summary=1 -> { notices: boolean, count: number, chat: number } -- just
        the red marks, for the app's 訊息 tab on every page and the bell on
        訊息 (components/AppShell): count is how many are new.
   POST { mark: 'announcements' | 'notices' } -> that tab looked at now. */

const KEEP_DAYS = INBOX_KEEP_DAYS

export async function GET(req: NextRequest) {
  const auth = await requireParent({ viewer: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc, user } = auth
  const since = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString()

  if (req.nextUrl.searchParams.get('summary')) {
    const { count, chat } = await inboxCounts(svc, user.id, auth.parent.id)
    return NextResponse.json({ notices: count > 0, count, chat })
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
