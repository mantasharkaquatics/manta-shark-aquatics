import type { SupabaseClient } from '@supabase/supabase-js'
import { activeAnnouncements } from '@/lib/announcements'
import { bannerClosures } from '@/lib/closures'

/* The red marks of the app (owner, 2026-10-28 and 2026-11-19), one count for
   everything that shows them:
   - `count`: what is new in the bell (notices to this person since they last
     opened the list, announcements they have not seen, closures before they
     ever looked) -- the bell's number on 訊息;
   - `chat`: desk and AI replies the family has not read -- the 訊息 tab.
   The number on the app's icon is the two together (iconBadge): sent with
   every push (lib/push.ts) and set again by the app whenever it asks
   (/api/app/inbox?summary=1, components/AppShell). */

export const INBOX_KEEP_DAYS = 90

/** Desk and AI replies in the family's chat newer than the family last read it. */
export async function chatUnread(svc: SupabaseClient, parentId: string): Promise<number> {
  const { data: th, error } = await svc.from('chat_threads').select('id, parent_last_read_at')
    .eq('parent_id', parentId).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (error || !th) return 0
  const t = th as { id: string; parent_last_read_at: string | null }
  let q = svc.from('chat_messages').select('id', { count: 'exact', head: true })
    .eq('thread_id', t.id).in('sender_type', ['admin', 'ai']).is('recalled_at', null)
  if (t.parent_last_read_at) q = q.gt('created_at', t.parent_last_read_at)
  const { count } = await q
  return count || 0
}

export async function inboxCounts(svc: SupabaseClient, userId: string, parentId: string): Promise<{ count: number; chat: number }> {
  const since = new Date(Date.now() - INBOX_KEEP_DAYS * 86400000).toISOString()
  const [seen, closures, announcements, chat] = await Promise.all([
    svc.from('app_inbox_seen').select('announcements_seen_at, notices_seen_at').eq('auth_user_id', userId).maybeSingle()
      .then(r => (r.error ? null : r.data as { announcements_seen_at: string | null; notices_seen_at: string | null } | null)),
    bannerClosures(svc).catch(() => []),
    activeAnnouncements(svc).catch(() => []),
    chatUnread(svc, parentId).catch(() => 0),
  ])
  let nq = svc.from('push_log').select('id', { count: 'exact', head: true }).eq('auth_user_id', userId).gte('created_at', since)
  if (seen?.notices_seen_at) nq = nq.gt('created_at', seen.notices_seen_at)
  const { count: newNotices } = await nq
  const annSeen = seen?.announcements_seen_at ?? null
  const count = (newNotices || 0)
    + (announcements as { created_at: string }[]).filter(a => !annSeen || a.created_at > annSeen).length
    + (annSeen ? 0 : (closures as unknown[]).length)
  return { count, chat }
}

/** The number on the app's icon: the bell's new ones and the unread replies. */
export async function iconBadge(svc: SupabaseClient, userId: string, parentId: string): Promise<number> {
  const { count, chat } = await inboxCounts(svc, userId, parentId)
  return count + chat
}
