import { NextResponse } from 'next/server'
import { getAuthUser, serviceClient, familyOf } from '@/lib/api-auth'
import { activeLocations, getLocations, showLocations, poolHasDetails, withoutDetails, DEFAULT_LOCATION_ID, type Location } from '@/lib/locations'

// GET -> the pools families can book, whether to show a location at all, and
// (signed-in family) each swimmer's usual pool: the pool of their latest
// lesson, booked or swum, so the booking page opens there.
// `hidden`: the pools closed to booking, only so a lesson already at one can
// still be named on the family's cards (lib/locations lessonPoolShown, found
// 2026-10-15, F66). Never offered for booking. The table is readable by
// anyone (RLS select), so this tells nobody anything new.
//
// `details`: the address, map link, phone and arrival notes (owner,
// 2026-10-22: "the address only goes to families with a booking"). Sent only
// to a signed-in family with at least one lesson booked, ever; everyone else
// gets the names. `details` is also true when some pool has them, so the
// dashboard knows to show a lesson's pool with one pool open.
export async function GET() {
  const svc = serviceClient()
  const all = await getLocations(svc)
  const show = showLocations(all)
  const anyDetails = all.some(poolHasDetails)
  const studentLocations: Record<string, string> = {}
  let booked = false

  if (show || anyDetails) {
    const user = await getAuthUser()
    if (user) {
      const { data: parent } = await familyOf(svc, user.id, 'id')
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
          booked = (rows || []).length > 0
          const locations = activeLocations(all)
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

  const out = (l: Location) => {
    const { id, name, address, map_url, sort_order, is_active, phone, directions } = l
    const row = { id, name, address, map_url, sort_order, is_active, phone: phone ?? null, directions: directions ?? null }
    return booked ? row : withoutDetails(row)
  }
  return NextResponse.json(
    {
      locations: activeLocations(all).map(out), show, details: booked && anyDetails, studentLocations,
      hidden: all.filter(l => !l.is_active).map(out),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
