import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CoachDashboardClient from './CoachDashboardClient'

// An hour lesson is two class_sessions but ONE lesson. Merge the halves that
// share a lesson_group_id so a coach reads one card spanning the full hour,
// the way the admin day view already shows it.
function mergeHourHalves(list: any[]) {
  const byKey = new Map<string, any>()
  for (const s of list) {
    const groups = [...new Set((s.bookings || []).map((b: any) => b.lesson_group_id).filter(Boolean))]
    const key = groups.length === 1 ? 'g:' + groups[0] : 's:' + s.id
    const prev = byKey.get(key)
    if (!prev) { byKey.set(key, { ...s, bookings: [...(s.bookings || [])] }); continue }
    if (String(s.start_time) < String(prev.start_time)) prev.start_time = s.start_time
    if (String(s.end_time) > String(prev.end_time)) prev.end_time = s.end_time
    const seen = new Set(prev.bookings.map((b: any) => b.students?.id))
    for (const b of (s.bookings || [])) {
      if (b.students?.id && !seen.has(b.students.id)) { prev.bookings.push(b); seen.add(b.students.id) }
    }
  }
  return [...byKey.values()].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
}

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
        students(id, full_name, current_level, current_stage, profile_photo_url)
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
  const visibleToday = mergeHourHalves(todaySessions).filter((s: any) =>
    s.course_types?.slug === '1on4'
    || (s.bookings || []).some((b: any) => b.status !== 'cancelled')
  )

  return <CoachDashboardClient coach={coach} todaySessions={visibleToday} today={today} />
}
