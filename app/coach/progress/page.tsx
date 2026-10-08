import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CoachProgressClient from './CoachProgressClient'
import { NOT_REAL_BOOKING_STATUSES } from '../real-booking'

/** A database row as the API returns it (untyped client). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any
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

  // Step 1: fetch today's sessions
  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('id, start_time, end_time, course_type_id')
    .eq('coach_id', coach.id)
    .eq('session_date', today)
    .neq('status', 'cancelled')
    .order('start_time')

  // Reports an admin sent back, on any day: those lessons are on the list too.
  const sentBack = await loadSentBack(supabase, coach.id, today)

  if (!sessions || sessions.length === 0) {
    return <CoachProgressClient coach={coach} sessions={sentBack.sessions} today={today} completedKeys={[]} scheduledToday={0} sentBack={sentBack.byEntry} />
  }

  const sessionIds = sessions.map(s => s.id)
  const courseTypeIds = [...new Set(sessions.map(s => s.course_type_id).filter(Boolean))]

  // Step 2: fetch course types
  const { data: courseTypes } = await supabase
    .from('course_types')
    .select('id, name')
    .in('id', courseTypeIds)

  const courseTypeMap: Record<string, string> = {}
  for (const ct of courseTypes || []) courseTypeMap[ct.id] = ct.name

  // Step 3: fetch the real bookings (confirmed, completed -- not a basket, an
  // unpaid checkout or an unaccepted invite)
  const { data: realBookings } = await supabase
    .from('bookings')
    .select('id, class_session_id, student_id, lesson_group_id, is_trial, status')
    .in('class_session_id', sessionIds)
    .not('status', 'in', `(${NOT_REAL_BOOKING_STATUSES.join(',')})`)

  // scheduledToday separates "nothing on the calendar" from "nobody has checked
  // in yet". Both arrive at the client as an empty session list, and telling a
  // coach "no lessons scheduled" on a day they are about to teach reads as the
  // schedule being broken.
  // It used to be sessions.length, which counted leftover empty sessions (a
  // cancelled or never-paid booking leaves its session behind) and both halves
  // of an hour lesson, so a coach with one real lesson read "You have 3
  // lesson(s) today" (found 2026-10-04). Count what the Today page shows: a
  // session with at least one real booking, with an hour's two halves (one
  // shared lesson_group_id) counted once.
  const lessonKeys = new Set<string>()
  for (const s of sessions) {
    const mine = (realBookings || []).filter((b: any) => b.class_session_id === s.id)
    if (mine.length === 0) continue
    const groups = [...new Set(mine.map((b: any) => b.lesson_group_id).filter(Boolean))]
    lessonKeys.add(groups.length === 1 ? 'g:' + groups[0] : 's:' + s.id)
  }
  const scheduledToday = lessonKeys.size

  const bookingsRaw = (realBookings || []).filter((b: any) => b.status === 'confirmed')

  // Absent students need no progress: keep only bookings with an attendance row (checked in)
  let bookings: any[] = []
  if (bookingsRaw && bookingsRaw.length > 0) {
    const { data: attRows } = await supabase
      .from('attendance')
      .select('booking_id')
      .in('booking_id', bookingsRaw.map((b: any) => b.id))
    const attendedSet = new Set((attRows || []).map((r: any) => r.booking_id))
    bookings = bookingsRaw.filter((b: any) => attendedSet.has(b.id))
  }

  if (!bookings || bookings.length === 0) {
    return <CoachProgressClient coach={coach} sessions={sentBack.sessions} today={today} completedKeys={[]} scheduledToday={scheduledToday} sentBack={sentBack.byEntry} />
  }

  const studentIds = [...new Set(bookings.map(b => b.student_id).filter(Boolean))]

  // Step 4: fetch students
  const { data: students } = await supabase
    .from('students')
    .select('id, full_name, current_level')
    .in('id', studentIds)

  const studentMap: Record<string, any> = {}
  for (const s of students || []) studentMap[s.id] = s

  // Assemble
  const enrichedSessions = sessions.map(s => ({
    id: s.id,
    start_time: s.start_time,
    end_time: s.end_time,
    course_types: { id: s.course_type_id, name: courseTypeMap[s.course_type_id] || '' },
    bookings: bookings
      .filter(b => b.class_session_id === s.id)
      .map(b => ({ id: b.id, lesson_group_id: b.lesson_group_id, is_trial: !!b.is_trial, students: studentMap[b.student_id] || null }))
      .filter(b => b.students)
  }))

  // Check which students are completed today
  const allStudentIds = [...new Set(
    enrichedSessions.flatMap(s => s.bookings.map((b: any) => b.students?.id).filter(Boolean))
  )]

  // Completed = (student, lesson) pair; a lesson is lesson_group_id when set, else the session
  const groupOf: Record<string, string | null> = {}
  for (const b of bookings) groupOf[`${b.student_id}_${b.class_session_id}`] = b.lesson_group_id || null
  const allSessionIds = enrichedSessions.map(s => s.id)
  let completedKeys: string[] = []
  if (allSessionIds.length > 0) {
    const { data: completedRows } = await supabase
      .from('progress_history')
      .select('class_session_id, student_id')
      .in('class_session_id', allSessionIds)
      .eq('session_date', today)
      // Sent back by an admin: to be filed again, so not done.
      .neq('status', 'rejected')
    completedKeys = (completedRows || [])
      .filter((r: any) => r.class_session_id && r.student_id)
      .map((r: any) => {
        const g = groupOf[`${r.student_id}_${r.class_session_id}`]
        return `${r.student_id}_${g || r.class_session_id}`
      })
  }

  // A sent-back lesson from today is already in today's list.
  const todayIds = new Set(enrichedSessions.map(s => s.id))
  const merged = [...enrichedSessions, ...sentBack.sessions.filter((s: Row) => !todayIds.has(s.id))]
  return <CoachProgressClient coach={coach} sessions={merged} today={today} completedKeys={completedKeys} scheduledToday={scheduledToday} sentBack={sentBack.byEntry} />
}

/**
 * Lesson reports an admin sent back (/api/admin/report-sendback, owner
 * 2026-10-08), from any day, for the lessons that are THIS coach's now. Each
 * comes back as a session in the same shape the page builds for today's (with
 * its own session_date, which the client sends with the report), plus the
 * admin's reason by card key (student_lessonKey, as the client keys its
 * cards). The reason column needs docs/migration-report-sendback.sql; before
 * it is run the lesson is listed without one.
 *
 * Found by the lesson's coach today, not the coach who filed the report
 * (owner, 2026-10-08): a lesson moved to another coach after the send-back
 * used to vanish from every Progress page, since the filer no longer held it
 * and lesson-note refuses anyone else. The admin can also fill it in from
 * the Reviews "sent back" list (e.g. when the coach has left).
 */
async function loadSentBack(supabase: Row, coachId: string, today: string): Promise<{
  sessions: Row[]
  byEntry: Record<string, { reason: string | null; date: string }>
}> {
  const empty = { sessions: [], byEntry: {} }
  // Sent-back rows are few (the admin's Reviews list shows every one), so all
  // of them are read and matched to this coach's lessons below. With the
  // migration run, only rows sent back through that flow -- or this coach's
  // own, as before -- so an older 'rejected' row of someone else's (if any
  // exists, it has no sent_back_at) does not turn up here.
  let { data: rows, error } = await supabase.from('progress_history')
    .select('student_id, coach_id, class_session_id, lesson_group_id, session_date, sent_back_reason, sent_back_at')
    .eq('status', 'rejected').order('session_date').limit(1000)
  if (error) {
    ({ data: rows, error } = await supabase.from('progress_history')
      .select('student_id, coach_id, class_session_id, lesson_group_id, session_date')
      .eq('coach_id', coachId).eq('status', 'rejected').order('session_date'))
  }
  if (error || !rows || rows.length === 0) return empty
  rows = rows.filter((r: Row) => r.class_session_id && r.student_id && String(r.session_date) <= today
    && (r.coach_id === coachId || r.sent_back_at))
  if (rows.length === 0) return empty

  const sessionIds = [...new Set(rows.map((r: Row) => r.class_session_id))] as string[]
  const studentIds = [...new Set(rows.map((r: Row) => r.student_id))] as string[]
  const [{ data: sessions }, { data: students }, { data: bookings }] = await Promise.all([
    supabase.from('class_sessions').select('id, start_time, end_time, course_type_id, session_date, coach_id').in('id', sessionIds),
    supabase.from('students').select('id, full_name, current_level').in('id', studentIds),
    supabase.from('bookings').select('id, class_session_id, student_id, lesson_group_id, is_trial')
      .in('class_session_id', sessionIds).in('student_id', studentIds)
      .not('status', 'in', `(${NOT_REAL_BOOKING_STATUSES.join(',')})`),
  ])
  const ctIds = [...new Set((sessions || []).map((s: Row) => s.course_type_id).filter(Boolean))]
  const { data: cts } = ctIds.length > 0
    ? await supabase.from('course_types').select('id, name').in('id', ctIds)
    : { data: [] as Row[] }
  const ctName = new Map<string, string>((cts || []).map((c: Row) => [c.id, c.name]))
  const studentMap = new Map<string, Row>((students || []).map((s: Row) => [s.id, s]))

  const byEntry: Record<string, { reason: string | null; date: string }> = {}
  const out: Row[] = []
  // This coach's lesson today: lesson-note refuses a report on someone else's.
  for (const s of (sessions || []).filter((x: Row) => x.coach_id === coachId)) {
    const mine = rows.filter((r: Row) => r.class_session_id === s.id)
    const list = mine
      .map((r: Row) => {
        const b = (bookings || []).find((x: Row) => x.class_session_id === s.id && x.student_id === r.student_id)
        const st = studentMap.get(r.student_id)
        if (!b || !st) return null
        byEntry[`${r.student_id}_${b.lesson_group_id || s.id}`] = { reason: r.sent_back_reason ?? null, date: String(r.session_date) }
        return { id: b.id, lesson_group_id: b.lesson_group_id, is_trial: !!b.is_trial, students: st }
      })
      .filter(Boolean)
    if (list.length === 0) continue
    out.push({
      id: s.id,
      start_time: s.start_time,
      end_time: s.end_time,
      session_date: s.session_date,
      course_types: { id: s.course_type_id, name: ctName.get(s.course_type_id) || '' },
      bookings: list,
    })
  }
  return { sessions: out, byEntry }
}
