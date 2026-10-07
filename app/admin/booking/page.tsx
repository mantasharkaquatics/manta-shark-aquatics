import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import AdminBookingClient from './AdminBookingClient'
import { formatDateLA } from '@/lib/date'
import { allRowsOrLog } from '@/lib/db-paging'

export default async function AdminBookingPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

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

  return (
    <AdminBookingClient
      coaches={coaches || []}
      students={students || []}
      courseTypes={courseTypes || []}
      initialSessions={sessions || []}
    />
  )
}
