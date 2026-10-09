import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import AdminMembersClient from './AdminMembersClient'
import { allRowsOrLog } from '@/lib/db-paging'
import { serviceClient } from '@/lib/api-auth'

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

  // Who deactivated each deactivated swimmer, and when
  // (docs/migration-student-deactivation.sql). Read separately and allowed to
  // fail: before that migration the columns do not exist, and the page must
  // still list every family.
  const deactivations: Record<string, { at: string | null; by: string | null }> = {}
  try {
    const svc = serviceClient()
    const { data: off, error } = await svc.from('students')
      .select('id, deactivated_at, deactivated_by').eq('is_active', false)
    if (!error && off && off.length > 0) {
      const ids = [...new Set(off.map((r: any) => r.deactivated_by).filter(Boolean))] as string[]
      const { data: admins } = ids.length
        ? await svc.from('admins').select('id, first_name, last_name').in('id', ids)
        : { data: [] as any[] }
      const name = new Map((admins || []).map((a: any) => [a.id, [a.first_name, a.last_name].filter(Boolean).join(' ')]))
      for (const r of off as any[]) deactivations[r.id] = { at: r.deactivated_at ?? null, by: r.deactivated_by ? name.get(r.deactivated_by) ?? null : null }
    }
  } catch { /* no record shown */ }

  return <AdminMembersClient parents={parents} deactivations={deactivations} />
}
