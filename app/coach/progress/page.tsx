import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CoachProgressClient from './CoachProgressClient'
export const dynamic = 'force-dynamic'

export default async function CoachProgressPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/coach-login')

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, first_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!coach) redirect('/coach-login')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  const { data: rawSessions } = await supabase
    .from('class_sessions')
    .select('id, start_time, end_time, course_types(name), bookings(id, status, students(id, full_name, current_level))')
    .eq('coach_id', coach.id)
    .eq('session_date', today)
    .neq('status', 'cancelled')
    .order('start_time')

  const sessions = (rawSessions || []).map((s: any) => ({
    ...s,
    course_types: Array.isArray(s.course_types) ? s.course_types[0] : s.course_types,
    bookings: (s.bookings || [])
      .filter((b: any) => b.status === 'confirmed')
      .map((b: any) => ({ ...b, students: Array.isArray(b.students) ? b.students[0] : b.students }))
      .filter((b: any) => b.students)
  }))

  return <CoachProgressClient coach={coach} sessions={sessions} today={today} />
}
