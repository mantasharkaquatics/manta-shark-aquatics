import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import AdminMembersClient from './AdminMembersClient'
import { allRowsOrLog } from '@/lib/db-paging'

export default async function AdminMembersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  // Every family, a page at a time (lib/db-paging.ts): a single read stops
  // at 1,000 rows without saying so, and families past that point would have
  // been missing from this page (2026-10-05). Ordered by name, then id, so
  // the pages never overlap.
  const parents = await allRowsOrLog('admin/members', () => supabase
    .from('parents')
    .select(`
      id, first_name, last_name, email, phone,
      registered_at, terms_accepted_at, last_login_at, newsletter_subscribed, media_release_accepted, media_release_at,
      address_line1, address_line2, city, state, zip_code,
      last_activity_at, activity_reviewed_at,
      students(id, full_name, current_level, is_active, date_of_birth, created_at, added_by_parent, legal_full_name, uci_number, service_code)
    `)
    .order('first_name')
    .order('id'))

  return <AdminMembersClient parents={parents} />
}
