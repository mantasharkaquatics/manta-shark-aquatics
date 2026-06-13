import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CoachDashboardClient from './CoachDashboardClient'

export default async function CoachDashboardPage() {
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

  const { data: rawSessions } = await supabase
    .from('class_sessions')
    .select(`
      id, session_date, start_time, end_time, status,
      course_types(name, slug),
      bookings(
        id, status,
        students(id, full_name, current_level, profile_photo_url)
      )
    `)
    .eq('coach_id', coach.id)
    .eq('session_date', today)
    .neq('status', 'cancelled')
    .order('start_time')

  // normalize course_types from array to object
  const todaySessions = (rawSessions || []).map((s: any) => ({
    ...s,
    course_types: Array.isArray(s.course_types) ? s.course_types[0] : s.course_types,
    bookings: (s.bookings || []).map((b: any) => ({
      ...b,
      students: Array.isArray(b.students) ? b.students[0] : b.students,
    })),
  }))

  return <CoachDashboardClient coach={coach} todaySessions={todaySessions} today={today} />
}
