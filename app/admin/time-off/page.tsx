import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminTimeOffClient from './AdminTimeOffClient'
import { allRows, allRowsIn } from '@/lib/db-paging'

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
  // The badges are the desk's cue to act, so a failed read says so on the
  // page instead of showing every block as having nothing booked. Sessions
  // are read for these blocks' coaches only, and both reads are paged: one
  // read of every coach's sessions on every block date, with hundreds of ids
  // in one request and errors ignored, used to drop every badge (found 2026-10-08).
  let impactError = false
  if (allBlocks.length) {
    const dates = [...new Set(allBlocks.map((b: any) => b.date))]
    const coachIds = [...new Set(allBlocks.map((b: any) => b.coach_id))]
    const { data: sessions, error: sErr } = await allRows(() => svc
      .from('class_sessions')
      .select('id, coach_id, session_date, start_time, end_time')
      .in('coach_id', coachIds)
      .in('session_date', dates)
      .order('id'))
    const sessIds: string[] = sessions.map(s => s.id)
    const bRes = sErr || !sessIds.length
      ? null
      : await allRowsIn(sessIds, chunk => svc
          .from('bookings')
          .select('id, class_session_id, student_id, lesson_group_id, status, block_notice_sent_at, cancellation_reason, is_trial, pending_expires_at')
          .in('class_session_id', chunk)
          .or('status.eq.confirmed,status.eq.pending_partner,and(status.eq.pending_payment,is_trial.eq.true),and(status.eq.cancelled,cancellation_reason.eq.coach_time_off)')
          .order('id'))
    const bookings = bRes?.data || []
    const bErr = bRes?.error
    if (sErr || bErr) {
      impactError = true
      console.error('admin/time-off impact stats: read failed:', (sErr || bErr)?.message || sErr || bErr)
    }
    // An unanswered 1-on-2 invitation counts while it is still open.
    const nowMs = Date.now()
    const liveBookings = (bookings || []).filter((x: any) => x.status !== 'pending_partner' || (!!x.pending_expires_at && Date.parse(x.pending_expires_at) > nowMs))
    for (const b of impactError ? [] : allBlocks as any[]) {
      const overlapped = (sessions || []).filter((s: any) => {
        if (s.coach_id !== b.coach_id || s.session_date !== b.date) return false
        if (b.start_time == null || b.end_time == null) return true
        return toM(s.start_time) < toM(b.end_time) && toM(s.end_time) > toM(b.start_time)
      })
      const ids = new Set(overlapped.map((s: any) => s.id))
      const bs = liveBookings.filter((x: any) => ids.has(x.class_session_id))
      // Count lessons, not booking rows: a 60-minute lesson is two rows and
      // read as "2 affected" (found 2026-10-04).
      const lessons = (xs: any[]) => new Set(xs.map((x: any) => `${x.lesson_group_id || x.class_session_id}|${x.student_id}`)).size
      // Still needing the desk: a booked lesson, an assessment waiting for
      // payment, or a cancelled lesson whose email failed (found 2026-10-07).
      stats[b.id] = {
        pending: lessons(bs.filter((x: any) => !x.block_notice_sent_at)),
        notified: lessons(bs.filter((x: any) => x.status !== 'cancelled' && x.block_notice_sent_at)),
        handled: lessons(bs.filter((x: any) => x.status === 'cancelled' && x.block_notice_sent_at)),
      }
    }
  }

  return (
    <AdminTimeOffClient
      coaches={coaches || []}
      initialList={(timeOffList || []) as any}
      pastList={(pastList || []) as any}
      impactStats={stats}
      impactError={impactError}
      today={today}
    />
  )
}
