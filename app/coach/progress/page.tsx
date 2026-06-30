import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CoachProgressClient from './CoachProgressClient'
export const dynamic = 'force-dynamic'

export default async function CoachProgressPage() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) redirect('/coach-login')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, first_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!coach) redirect('/coach-login')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  // Step 1: 取今天的 sessions
  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('id, start_time, end_time, course_type_id')
    .eq('coach_id', coach.id)
    .eq('session_date', today)
    .neq('status', 'cancelled')
    .order('start_time')

  if (!sessions || sessions.length === 0) {
    return <CoachProgressClient coach={coach} sessions={[]} today={today} completedSessionIds={[]} />
  }

  const sessionIds = sessions.map(s => s.id)
  const courseTypeIds = [...new Set(sessions.map(s => s.course_type_id).filter(Boolean))]

  // Step 2: 取 course types
  const { data: courseTypes } = await supabase
    .from('course_types')
    .select('id, name')
    .in('id', courseTypeIds)

  const courseTypeMap: Record<string, string> = {}
  for (const ct of courseTypes || []) courseTypeMap[ct.id] = ct.name

  // Step 3: 取 confirmed bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, class_session_id, student_id')
    .in('class_session_id', sessionIds)
    .eq('status', 'confirmed')

  if (!bookings || bookings.length === 0) {
    return <CoachProgressClient coach={coach} sessions={[]} today={today} completedSessionIds={[]} />
  }

  const studentIds = [...new Set(bookings.map(b => b.student_id).filter(Boolean))]

  // Step 4: 取 students
  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, current_level')
    .in('id', studentIds)

  const studentMap: Record<string, any> = {}
  for (const s of students || []) studentMap[s.id] = s

  // 組合
  const enrichedSessions = sessions.map(s => ({
    id: s.id,
    start_time: s.start_time,
    end_time: s.end_time,
    course_types: { name: courseTypeMap[s.course_type_id] || '' },
    bookings: bookings
      .filter(b => b.class_session_id === s.id)
      .map(b => ({ id: b.id, students: studentMap[b.student_id] || null }))
      .filter(b => b.students)
  }))

  // 查今日哪些學生已完成
  const allStudentIds = [...new Set(
    enrichedSessions.flatMap(s => s.bookings.map((b: any) => b.students?.id).filter(Boolean))
  )]

  // 用 class_session_id 判斷哪些課堂已完成，避免同一天多堂課互相鎖定
  const allSessionIds = enrichedSessions.map(s => s.id)
  let completedSessionIds: string[] = []
  if (allSessionIds.length > 0) {
    const { data: completedRows } = await supabase
      .from('progress_history')
      .select('class_session_id')
      .in('class_session_id', allSessionIds)
      .eq('session_date', today)
    completedSessionIds = (completedRows || []).map((r: any) => r.class_session_id).filter(Boolean)
  }

  return <CoachProgressClient coach={coach} sessions={enrichedSessions} today={today} completedSessionIds={completedSessionIds} />
}
