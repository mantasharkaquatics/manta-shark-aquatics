import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CoachTimeOffClient from './CoachTimeOffClient'
import { serviceClient } from '@/lib/api-auth'
import { handledTimeOffIds, timeOffNeedingAction } from '@/lib/time-off'
import { getNowMinutesLA } from '@/lib/date'

export default async function CoachTimeOffPage() {
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
    .select('id, first_name, last_name')
    .eq('auth_user_id', user.id)
    .single()

  if (!coach) redirect('/dashboard')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  const { data: timeOffList } = await supabase
    .from('coach_time_off')
    .select('id, date, reason, created_at, start_time, end_time')
    .eq('coach_id', coach.id)
    .eq('block_type', 'time_off')
    .gte('date', today)
    .order('date')

  // Time off whose families the admin has already told (cancelled and
  // emailed) cannot be removed by the coach (owner, 2026-10-07). The coach's
  // own client cannot read other families' bookings, so this asks with the
  // service role. If the read fails, every row is treated as told: the server
  // refuses those deletes anyway, so offering the button would only fail.
  const rows = timeOffList || []
  const svc = serviceClient()
  const [handled, waitingItems, { data: officeRows, error: officeErr }] = await Promise.all([
    handledTimeOffIds(svc, rows.map((r: any) => ({ ...r, coach_id: coach.id }))),
    /* How many booked lessons in each request still wait for the office: the
       list showed only the date and a Cancel button, so between sending and
       the office's "cancel & notify" the coach could not tell whether
       anything had been done (found 2026-10-08). Same reading as Reviews. */
    timeOffNeedingAction(svc, today, getNowMinutesLA(), false, coach.id),
    /* Blocks the office entered for this coach (admin_block) -- a coach who
       phoned in an absence saw "no time off" and filed it again (owner,
       2026-10-08: shown, marked as entered by the office, not removable). */
    svc.from('coach_time_off')
      .select('id, date, reason, created_at, start_time, end_time')
      .eq('coach_id', coach.id)
      .eq('block_type', 'admin_block')
      .gte('date', today)
      .order('date'),
  ])
  if (officeErr) console.error('coach/time-off: office blocks not read:', officeErr.message)
  const lockedIds = handled ? [...handled] : rows.map((r: any) => r.id)
  const waiting: Record<string, number> = {}
  for (const w of waitingItems) waiting[w.id] = w.lessons.length

  return <CoachTimeOffClient coach={coach} timeOffList={rows} officeList={officeRows || []} waiting={waiting} lockedIds={lockedIds} today={today} />
}
