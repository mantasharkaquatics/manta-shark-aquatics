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
    .select('id, first_name, last_name, default_note_language')
    .eq('auth_user_id', user.id)
    .single()

  if (!coach) redirect('/dashboard')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  // Same ambiguity as /coach/schedule: bookings reaches class_sessions through
  // both class_session_id and pending_new_session_id, so the embed must name one.
  const { data: rawSessions, error: sessionsError } = await supabase
    .from('class_sessions')
    .select(`
      id, session_date, start_time, end_time, status,
      course_types(name, slug),
      bookings!class_session_id(
        id, status, lesson_group_id,
        students(id, full_name, current_level, profile_photo_url)
      )
    `)
    .eq('coach_id', coach.id)
    .eq('session_date', today)
    .neq('status', 'cancelled')
    .order('start_time')

  if (sessionsError) console.error('coach/today: session query failed', sessionsError)

  // normalize course_types from array to object
  const todaySessions = (rawSessions || []).map((s: any) => ({
    ...s,
    course_types: Array.isArray(s.course_types) ? s.course_types[0] : s.course_types,
    bookings: (s.bookings || []).map((b: any) => ({
      ...b,
      students: Array.isArray(b.students) ? b.students[0] : b.students,
    })),
  }))

  // An empty 1-on-1 or 1-on-2 slot is a leftover shell: a session is created when
  // a lesson is booked but is never removed when that lesson is cancelled or the
  // invitation expires. A group class with nobody in it is a real scheduled
  // class, so that one stays visible.
  const visibleToday = todaySessions.filter((s: any) =>
    s.course_types?.slug === '1on4'
    || (s.bookings || []).some((b: any) => b.status !== 'cancelled')
  )

  return <CoachDashboardClient coach={coach} todaySessions={visibleToday} today={today} />
}
