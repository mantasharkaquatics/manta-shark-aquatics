import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { checkInStudent, checkInStatus } from '@/lib/checkin'
import { CHECKIN_VENUES, nearestVenue, MAX_ACCURACY_M, MAX_ACCURACY_SLACK_M } from '@/lib/venues'

/* The parent's "I'm here" button (owner, 2026-09-26: a web version of the
   arrive-and-you're-checked-in that native swim-school apps do; the fully
   automatic version waits for the app).

   GET  -> for each of the parent's swimmers: is a lesson open for check-in
           right now, and has today's lesson already been checked in. The page
           only shows the button when one is open.
   POST -> { student_id, lat, lng, accuracy } from the phone's location. Checked
           against the pools in lib/venues.ts, then the same check-in the front
           desk does, recorded as method 'self' so staff can tell it apart.

   The location comes from the parent's phone and a determined person could
   fake it. What that buys them is a tick on an attendance list, so this is a
   convenience check, not a security boundary; the coach still sees who is in
   the water. */

async function ownStudentIds(svc: any, parentId: string): Promise<string[]> {
  const { data } = await svc.from('students').select('id').eq('parent_id', parentId).eq('is_active', true)
  return (data || []).map((s: any) => s.id)
}

export async function GET() {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (CHECKIN_VENUES.length === 0) return NextResponse.json({ enabled: false, students: {} })

  const ids = await ownStudentIds(auth.svc, auth.parent.id)
  const entries = await Promise.all(ids.map(async id => [id, await checkInStatus(auth.svc, id)] as const))
  return NextResponse.json({ enabled: true, students: Object.fromEntries(entries) })
}

export async function POST(req: NextRequest) {
  const auth = await requireParent()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (!body) return badRequest()
  const { student_id, lat, lng, accuracy } = body
  if (!student_id || typeof lat !== 'number' || typeof lng !== 'number') return badRequest()

  const ids = await ownStudentIds(auth.svc, auth.parent.id)
  if (!ids.includes(student_id)) return NextResponse.json({ error: 'Unauthorized', code: 'not_yours' }, { status: 403 })

  const near = nearestVenue(lat, lng)
  if (!near) return NextResponse.json({ error: 'Not available', code: 'not_configured' }, { status: 503 })

  const acc = typeof accuracy === 'number' && accuracy > 0 ? accuracy : 0
  if (acc > MAX_ACCURACY_M) return NextResponse.json({ error: 'Location too imprecise', code: 'weak_gps' }, { status: 422 })
  if (near.distance > near.venue.radiusM + Math.min(acc, MAX_ACCURACY_SLACK_M)) {
    return NextResponse.json({ error: 'Not at the pool', code: 'too_far', distance: Math.round(near.distance) }, { status: 422 })
  }

  const r = await checkInStudent(auth.svc, student_id, 'self')
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: r.status })
  return NextResponse.json({ success: true, lesson_times: r.lesson_times, venue: near.venue.name })
}
