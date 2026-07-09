import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
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
      .select('id, coach_id, date, reason, created_at, start_time, end_time, block_type, coaches(first_name, last_name)')
      .gte('date', today)
      .order('date'),
    supabase
      .from('coach_time_off')
      .select('id, coach_id, date, reason, created_at, start_time, end_time, block_type, coaches(first_name, last_name)')
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(20),
    supabase
      .from('coaches')
      .select('id, first_name, last_name')
      .eq('is_active', true)
      .order('first_name'),
  ])

  // Per-block impact stats (confirmed / notified / cancelled-by-block)
  // Admin client has no SELECT policy on bookings (RLS silently returns empty) - stats must use service role
  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const allBlocks = [...(timeOffList || []), ...(pastList || [])]
  const toM = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  const stats: Record<string, { pending: number; notified: number; handled: number }> = {}
  if (allBlocks.length) {
    const dates = [...new Set(allBlocks.map((b: any) => b.date))]
    const { data: sessions } = await svc
      .from('class_sessions')
      .select('id, coach_id, session_date, start_time, end_time')
      .in('session_date', dates)
    const sessIds = (sessions || []).map((s: any) => s.id)
    const { data: bookings } = sessIds.length
      ? await svc
          .from('bookings')
          .select('id, class_session_id, status, block_notice_sent_at, cancellation_reason')
          .in('class_session_id', sessIds)
          .or('status.eq.confirmed,and(status.eq.cancelled,cancellation_reason.eq.coach_time_off)')
      : { data: [] }
    for (const b of allBlocks as any[]) {
      const overlapped = (sessions || []).filter((s: any) => {
        if (s.coach_id !== b.coach_id || s.session_date !== b.date) return false
        if (b.start_time == null || b.end_time == null) return true
        return toM(s.start_time) < toM(b.end_time) && toM(s.end_time) > toM(b.start_time)
      })
      const ids = new Set(overlapped.map((s: any) => s.id))
      const bs = (bookings || []).filter((x: any) => ids.has(x.class_session_id))
      stats[b.id] = {
        pending: bs.filter((x: any) => x.status === 'confirmed' && !x.block_notice_sent_at).length,
        notified: bs.filter((x: any) => x.status === 'confirmed' && x.block_notice_sent_at).length,
        handled: bs.filter((x: any) => x.status === 'cancelled').length,
      }
    }
  }

  return (
    <AdminTimeOffClient
      coaches={coaches || []}
      initialList={(timeOffList || []) as any}
      pastList={(pastList || []) as any}
      impactStats={stats}
      today={today}
    />
  )
}
