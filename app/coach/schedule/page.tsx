import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CoachScheduleClient from './CoachScheduleClient'

export default async function CoachSchedulePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, first_name, last_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!coach) redirect('/dashboard')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  const { data: rawSessions } = await supabase
    .from('class_sessions')
    .select(`
      id, session_date, start_time, end_time, status, enrolled_count, max_students,
      course_types(name, slug),
      bookings(id, status, students(id, full_name, current_level))
    `)
    .eq('coach_id', coach.id)
    .gte('session_date', today)
    .lte('session_date', in30Days)
    .neq('status', 'cancelled')
    .order('session_date')
    .order('start_time')

  const sessions = (rawSessions || []).map((s: any) => ({
    ...s,
    course_types: Array.isArray(s.course_types) ? s.course_types[0] : s.course_types,
    bookings: (s.bookings || []).map((b: any) => ({
      ...b,
      students: Array.isArray(b.students) ? b.students[0] : b.students,
    })),
  }))

  return <CoachScheduleClient coach={coach} sessions={sessions} today={today} />
}
