'use client'
import { useState, useEffect, useId } from 'react'
import { createClient } from '@/lib/supabase/client'

/**
 * How many parent conversations are waiting for a person: chat_threads with
 * unread_by_admin, which the AI sets when it hands a family over
 * (/api/chat/ai-reply, escalate) and a parent's message sets in a human-run
 * thread. The sidebar's Messages item shows it (app/admin/AdminNav.tsx).
 *
 * This used to be a whole nav link of its own; it fell out when the top bar
 * became the sidebar (5b94ef5) and nothing showed a handoff anywhere but the
 * Messages page itself (found 2026-10-08). A head-only count is one cheap
 * query, read on each page change and live on any change to a thread.
 */
export function useUnreadChats(pathname: string): number {
  const [unread, setUnread] = useState(0)
  // The sidebar and the phone menu can both be mounted: one channel each.
  const id = useId()

  useEffect(() => {
    const supabase = createClient()
    let alive = true
    const load = async () => {
      const { count, error } = await supabase
        .from('chat_threads')
        .select('id', { count: 'exact', head: true })
        .eq('unread_by_admin', true)
      if (alive && !error) setUnread(count || 0)
    }
    load()
    const channel = supabase
      .channel('admin:unread:badge:' + id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_threads' }, () => { load() })
      .subscribe()
    return () => { alive = false; supabase.removeChannel(channel) }
  }, [pathname, id])

  return unread
}
