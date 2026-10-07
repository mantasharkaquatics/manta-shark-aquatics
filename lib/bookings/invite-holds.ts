import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sessions held by a 1-on-2 invitation the other family has not answered yet.
 *
 * An invitation's rows are 'pending_partner' and do not count toward
 * enrolled_count (confirm-partner relies on that: it adds both seats when the
 * invitation is accepted). So by enrolled_count alone the session looked
 * empty, and for those 15 minutes another family could be booked into the
 * same coach and time -- even into the invitation's own session. Withdrawing
 * the invitation then took their lesson down with it (found 2026-10-07).
 * The booking routes treat a held session as taken.
 */
export async function sessionsHeldByInvites(svc: SupabaseClient, sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set()
  const { data } = await svc.from('bookings').select('class_session_id')
    .in('class_session_id', sessionIds)
    .eq('status', 'pending_partner')
    .gt('pending_expires_at', new Date().toISOString())
  return new Set((data || []).map((r: any) => r.class_session_id).filter(Boolean))
}

/**
 * The sessions themselves, for screens that list free times over a range
 * (openings, fixed-class slots, the coach's booked times). Live invitations
 * only last 15 minutes, so there are few of them at any moment: read them all,
 * then keep the sessions in range.
 *
 * Each comes back looking full (enrolled_count = max_students), so code that
 * already treats a session with people in it as taken treats these the same.
 */
export async function inviteHeldSessions(
  svc: SupabaseClient,
  opts: { coachIds?: string[]; from?: string; to?: string } = {},
): Promise<any[]> {
  const { data: rows } = await svc.from('bookings').select('class_session_id')
    .eq('status', 'pending_partner')
    .gt('pending_expires_at', new Date().toISOString())
    .limit(1000)
  const ids = [...new Set((rows || []).map((r: any) => r.class_session_id).filter(Boolean))] as string[]
  if (ids.length === 0) return []
  const { data: sess } = await svc.from('class_sessions')
    .select('id, coach_id, session_date, start_time, end_time, course_type_id, enrolled_count, max_students, status')
    .in('id', ids)
  return (sess || [])
    .filter((s: any) => s.status !== 'cancelled')
    .filter((s: any) => !opts.coachIds || opts.coachIds.includes(s.coach_id))
    .filter((s: any) => (!opts.from || s.session_date >= opts.from) && (!opts.to || s.session_date <= opts.to))
    .map((s: any) => ({ ...s, enrolled_count: Math.max(s.enrolled_count || 0, s.max_students || 1), invite_held: true }))
}
