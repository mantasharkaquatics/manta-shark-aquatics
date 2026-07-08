import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import CoachTimeOffClient from './CoachTimeOffClient'

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

  return <CoachTimeOffClient coach={coach} timeOffList={timeOffList || []} today={today} />
}
