import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminTimeOffClient from './AdminTimeOffClient'

export default async function AdminTimeOffPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  const [{ data: timeOffList }, { data: pastList }, { data: coaches }] = await Promise.all([
    supabase
      .from('coach_time_off')
      .select('id, date, reason, created_at, start_time, end_time, block_type, coaches(first_name, last_name)')
      .gte('date', today)
      .order('date'),
    supabase
      .from('coach_time_off')
      .select('id, date, reason, created_at, start_time, end_time, block_type, coaches(first_name, last_name)')
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(20),
    supabase
      .from('coaches')
      .select('id, first_name, last_name')
      .eq('is_active', true)
      .order('first_name'),
  ])

  return (
    <AdminTimeOffClient
      coaches={coaches || []}
      initialList={(timeOffList || []) as any}
      pastList={(pastList || []) as any}
      today={today}
    />
  )
}
