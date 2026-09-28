'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useIsMobile } from '@/lib/use-is-mobile'
import ChatWidget from '@/components/ChatWidget'

/* The chat button on every public, account and sign-in page (owner,
   2026-09-28). It used to be mounted page by page for signed-in parents only,
   so it was missing from most of the site, and a visitor could not ask
   anything before signing up. Mounted once per layout, it follows the visitor
   from page to page; signed out it runs as a guest chat (see ChatWidget).

   The admin and coach areas have their own layouts and do not include it. */
export default function GlobalChat() {
  const pathname = usePathname()
  const isPhone = useIsMobile(641)
  // undefined = not known yet; null = signed out (or not a parent account).
  const [parentId, setParentId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const supabase = createClient()
    let alive = true
    const apply = async (uid?: string) => {
      if (!uid) { if (alive) setParentId(null); return }
      const { data } = await supabase.from('parents').select('id').eq('auth_user_id', uid).maybeSingle()
      if (alive) setParentId(data?.id ?? null)
    }
    supabase.auth.getUser().then(({ data: { user } }) => apply(user?.id))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => { apply(session?.user?.id) })
    return () => { alive = false; subscription.unsubscribe() }
  }, [])

  if (parentId === undefined) return null
  // The booking page has its own sticky bar along the bottom on a phone.
  const lift = isPhone && pathname.startsWith('/booking') ? 104 : 0
  // Keyed on the account, so signing in or out starts the right kind of chat.
  return <ChatWidget key={parentId ?? 'guest'} parentId={parentId} lift={lift} />
}
