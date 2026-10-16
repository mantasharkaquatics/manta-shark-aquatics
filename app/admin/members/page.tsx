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

  // Who has been marked as the account holder or not ("this swimmer is me",
  // F15): true / false as stored, absent when nobody has said. Read on its
  // own and allowed to fail: before docs/migration-account-holder-swimmer.sql
  // the column does not exist, and the desk then has no toggle to offer.
  let holderReady = false
  try {
    const { data: marked, error } = await serviceClient().from('students')
      .select('id, is_account_holder').not('is_account_holder', 'is', null)
    if (!error) {
      holderReady = true
      const val = new Map((marked || []).map((h: { id: string; is_account_holder: boolean }) => [h.id, h.is_account_holder]))
      for (const p of parents as { students?: { id: string; is_account_holder?: boolean }[] }[])
        for (const st of p.students || []) if (val.has(st.id)) st.is_account_holder = val.get(st.id)
    }
  } catch { /* no toggle shown */ }

  return <AdminMembersClient parents={parents} deactivations={deactivations} holderReady={holderReady} />
}
