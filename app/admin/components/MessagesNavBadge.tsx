'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { usePathname } from 'next/navigation'

export default function MessagesNavBadge() {
  const supabase = createClient()
  const [unreadCount, setUnreadCount] = useState(0)
  const pathname = usePathname()

  useEffect(() => {
    loadUnread()
    const channel = supabase
      .channel('admin:unread:badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_threads' }, () => {
        loadUnread()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  async function loadUnread() {
    const { count } = await supabase
      .from('chat_threads')
      .select('id', { count: 'exact', head: true })
      .eq('unread_by_admin', true)
    setUnreadCount(count || 0)
  }

  const isActive = pathname === '/admin/messages'

  return (
    <Link href="/admin/messages"
      className={`relative text-gray-300 hover:text-[#c9a84c] hover:bg-[#1e3a6e] px-3 py-2 rounded-lg text-sm transition-all ${isActive ? 'text-[#c9a84c] bg-[#1e3a6e]' : ''}`}>
      Messages
      {unreadCount > 0 && (
        <span style={{
          position: 'absolute', top: '4px', right: '4px',
          background: '#ef4444', color: '#fff',
          borderRadius: '999px', fontSize: '10px', fontWeight: 700,
          minWidth: '16px', height: '16px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 4px', lineHeight: 1,
        }}>{unreadCount}</span>
      )}
    </Link>
  )
}
