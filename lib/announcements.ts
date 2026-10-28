import type { SupabaseClient } from '@supabase/supabase-js'
import { pushFamily } from '@/lib/push'

/* Announcements the desk writes on Admin > 公告 (owner, 2026-10-28) for the
   app's 學校公告 tab. docs/migration-app-inbox.sql. Written in the desk's own
   words and shown as typed, in one language, like a closure's own reason.

   Pushed only when the desk ticks "also push" when posting, and then only to
   people who turned on 學校公告與活動 under 我的 (category 'news': off until
   turned on -- Apple 4.5.4). Not kept in push_log: the tab itself holds them. */

export type Announcement = {
  id: string
  title: string
  body: string
  pinned: boolean
  expires_at: string | null
  pushed_at: string | null
  push_count: number | null
  created_at: string
}

const COLS = 'id, title, body, pinned, expires_at, pushed_at, push_count, created_at'

/** What families see now: not taken down, not past its end; pinned first. */
export async function activeAnnouncements(svc: SupabaseClient): Promise<Announcement[]> {
  const now = new Date().toISOString()
  const { data, error } = await svc.from('announcements').select(COLS)
    .is('deleted_at', null).or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(50)
  if (error) return []
  return (data || []) as Announcement[]
}

/** Every announcement not taken down, for the desk. */
export async function allAnnouncements(svc: SupabaseClient): Promise<Announcement[]> {
  const { data, error } = await svc.from('announcements').select(COLS)
    .is('deleted_at', null).order('created_at', { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  return (data || []) as Announcement[]
}

/** Push one announcement to every family with the app. Returns how many
 *  phones Firebase accepted it for. */
export async function pushAnnouncement(svc: SupabaseClient, a: Pick<Announcement, 'title' | 'body'>): Promise<number> {
  const { data } = await svc.from('push_devices').select('parent_id').eq('permission', true)
  const families = [...new Set(((data || []) as { parent_id: string }[]).map(r => r.parent_id))]
  const body = a.body.replace(/\s+/g, ' ').trim()
  let sent = 0
  for (const pid of families) {
    sent += await pushFamily(svc, pid, {
      category: 'news',
      kind: 'announcement',
      log: false,
      viewerOk: true,
      url: '/dashboard/chat?tab=news',
      text: () => ({ title: a.title, body: body.length > 160 ? body.slice(0, 157) + '…' : body }),
    })
  }
  return sent
}
