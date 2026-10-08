import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CoachDashboardClient from './CoachDashboardClient'
import { isRealBooking } from './real-booking'
import { serviceClient } from '@/lib/api-auth'
import { sessionsInBlocks } from '@/lib/time-off'

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
  if (!user) redirect('/coach-login')

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
      course_types(id, name, slug),
      bookings!class_session_id(
        id, status, lesson_group_id, is_trial,
        students(id, full_name, current_level, current_stage, profile_photo_url)
      )
    `)
    .eq('coach_id', coach.id)
    .eq('session_date', today)
    .neq('status', 'cancelled')
    .order('start_time')

  if (sessionsError) console.error('coach/today: session query failed', sessionsError)

  // normalize course_types from array to object
  // Only real bookings travel on (found 2026-10-04): a cancelled, in-cart,
  // unpaid or unaccepted-invite row is not a swimmer the coach should expect,
  // and dropping them BEFORE mergeHourHalves also stops a cancelled booking's
  // lesson_group_id from merging a session into an hour it no longer belongs to.
  const todaySessions = (rawSessions || []).map((s: any) => ({
    ...s,
    course_types: Array.isArray(s.course_types) ? s.course_types[0] : s.course_types,
    bookings: (s.bookings || []).filter(isRealBooking).map((b: any) => ({
      ...b,
      // The booking's own session survives mergeHourHalves: the skills panel
      // asks /api/coach/progress with it, which checks the swimmer is booked there.
      session_id: s.id,
      students: Array.isArray(b.students) ? b.students[0] : b.students,
    })),
  }))

  // An empty session is a leftover shell: a session is created when a lesson is
  // booked but is never removed when that lesson is cancelled or the invitation
  // expires. Empty 1-on-4 sessions used to be kept here as "a real scheduled
  // class", but /coach/schedule had already dropped them (group times come from
  // the coach's zones, not from sessions), so Today and Schedule disagreed about
  // the same day. Same rule on both now (found 2026-10-04).
  const visibleToday = mergeHourHalves(todaySessions).filter((s: any) =>
    (s.bookings || []).length > 0
  )

  /* Lessons inside this coach's time off (or a block the office entered)
     stay on the list until the office cancels them; they looked like any
     other lesson, so the coach could not tell the office had not acted yet
     (found 2026-10-08). Read with the service role: an office block may not
     be readable through the coach's own client. */
  const { data: blocks, error: blocksErr } = await serviceClient()
    .from('coach_time_off').select('date, start_time, end_time')
    .eq('coach_id', coach.id)
    .eq('date', today)
  if (blocksErr) console.error('coach/today: time off not read', blocksErr)
  const offIds = sessionsInBlocks(visibleToday, blocks || [])

  // loadFailed: a failed read said "no classes today" -- a coach could take
  // that at face value and go home (found 2026-10-08).
  return <CoachDashboardClient coach={coach} todaySessions={visibleToday} today={today} offIds={offIds} loadFailed={!!sessionsError} />
}
