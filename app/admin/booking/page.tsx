import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import AdminBookingClient from './AdminBookingClient'

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
      supabase.from('students').select('id, full_name, current_level, parent_id, parents(id, first_name, last_name)').eq('is_active', true).order('full_name'),
      supabase.from('course_types').select('id, name, slug, duration_minutes, max_students').eq('is_active', true).order('sort_order'),
      supabase
        .from('class_sessions')
        .select('id, coach_id, session_date, start_time, end_time, max_students, enrolled_count, status, course_type_id, course_types(name, slug, duration_minutes)')
        .gte('session_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
        .lte('session_date', new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
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
