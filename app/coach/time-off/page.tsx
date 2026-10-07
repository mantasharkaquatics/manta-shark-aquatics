import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CoachTimeOffClient from './CoachTimeOffClient'
import { serviceClient } from '@/lib/api-auth'
import { handledTimeOffIds } from '@/lib/time-off'

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
  if (!user) redirect('/login')

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
  const handled = await handledTimeOffIds(serviceClient(), rows.map((r: any) => ({ ...r, coach_id: coach.id })))
  const lockedIds = handled ? [...handled] : rows.map((r: any) => r.id)

  return <CoachTimeOffClient coach={coach} timeOffList={rows} lockedIds={lockedIds} today={today} />
}
