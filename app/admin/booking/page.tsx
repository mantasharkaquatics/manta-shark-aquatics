import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminBookingClient from './AdminBookingClient'
import { formatDateLA } from '@/lib/date'
import { allRowsIn, allRowsOrLog } from '@/lib/db-paging'
import { serviceClient } from '@/lib/api-auth'

export default async function AdminBookingPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  // The balances below are read with the service role, so this page checks
  // for an admin itself rather than relying on the layout alone.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  const [{ data: coaches }, { data: students }, { data: courseTypes }, { data: sessions }] =
    await Promise.all([
      supabase.from('coaches').select('id, first_name, last_name').eq('is_active', true).order('first_name'),
      // Paged: one read stopped at the API's 1,000-row cap, and swimmers late
      // in name order silently dropped out of the student picker (found
      // 2026-10-07). id breaks name ties so the pages cannot overlap.
      allRowsOrLog('admin/booking students', () => supabase.from('students').select('id, full_name, current_level, parent_id, trial_used_at, parents(id, first_name, last_name, email)').eq('is_active', true).order('full_name').order('id'))
        .then(data => ({ data })),
      supabase.from('course_types').select('id, name, slug, duration_minutes, max_students').eq('is_active', true).order('sort_order'),
      supabase
        .from('class_sessions')
        .select('id, coach_id, session_date, start_time, end_time, max_students, enrolled_count, status, course_type_id, course_types(name, slug, duration_minutes)')
        .gte('session_date', formatDateLA(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)))
        .lte('session_date', formatDateLA(new Date(Date.now() + 21 * 24 * 60 * 60 * 1000)))
        .neq('status', 'cancelled')
        .order('session_date')
        .order('start_time'),
    ])

  // Every family's points balance for the swimmer picker, in one batched read
  // (IN_CHUNK parents per request). It used to be one /api/admin/points call
  // per family from the browser, each a full wallet summary (found 2026-10-08).
  // A family with no wallet yet has 0; on a failed read the families not read
  // show no balance rather than a wrong 0.
  const parentIds = [...new Set((students || []).map((s) => {
    const p = Array.isArray(s.parents) ? s.parents[0] : s.parents
    return (p?.id || s.parent_id) as string | null
  }).filter(Boolean))] as string[]
  const parentBalances: Record<string, number> = {}
  if (parentIds.length) {
    const { data: wallets, error } = await allRowsIn(parentIds, chunk =>
      serviceClient().from('point_wallets').select('parent_id, balance_purchased, balance_granted').in('parent_id', chunk).order('parent_id'))
    if (error) console.error('admin/booking wallets: read failed:', error.message || error)
    else for (const id of parentIds) parentBalances[id] = 0
    for (const w of wallets) parentBalances[w.parent_id] = (w.balance_purchased || 0) + (w.balance_granted || 0)
  }

  return (
    <AdminBookingClient
      parentBalances={parentBalances}
      coaches={coaches || []}
      students={students || []}
      courseTypes={courseTypes || []}
      initialSessions={sessions || []}
    />
  )
}
