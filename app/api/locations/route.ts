import { NextResponse } from 'next/server'
import { getAuthUser, serviceClient } from '@/lib/api-auth'
import { activeLocations, getLocations, showLocations, DEFAULT_LOCATION_ID } from '@/lib/locations'

// GET -> the pools families can book, whether to show a location at all, and
// (signed-in family) each swimmer's usual pool: the pool of their latest
// lesson, booked or swum, so the booking page opens there.
export async function GET() {
  const svc = serviceClient()
  const all = await getLocations(svc)
  const locations = activeLocations(all)
  const show = showLocations(all)
  const studentLocations: Record<string, string> = {}

  if (show) {
    const user = await getAuthUser()
    if (user) {
      const { data: parent } = await svc.from('parents').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (parent) {
        const { data: kids } = await svc.from('students').select('id').eq('parent_id', parent.id)
        const ids = (kids || []).map((k: any) => k.id)
        if (ids.length > 0) {
          // bookings has more than one link to class_sessions, so the embed must
          // name its foreign key; a bare class_sessions(...) is an error, and every
          // swimmer then fell back to the first pool (found 2026-10-09).
          const { data: rows } = await svc
            .from('bookings')
            .select('student_id, class_sessions!bookings_class_session_id_fkey(session_date, location_id)')
            .in('student_id', ids)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false })
            .limit(400)
          const latest: Record<string, string> = {}
          for (const r of (rows || []) as any[]) {
            const cs = Array.isArray(r.class_sessions) ? r.class_sessions[0] : r.class_sessions
            if (!cs?.session_date) continue
            const loc = cs.location_id || DEFAULT_LOCATION_ID
            if (!locations.some(l => l.id === loc)) continue
            if (!latest[r.student_id] || cs.session_date > latest[r.student_id]) {
              latest[r.student_id] = cs.session_date
              studentLocations[r.student_id] = loc
            }
          }
        }
      }
    }
  }

  return NextResponse.json(
    { locations, show, studentLocations },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
