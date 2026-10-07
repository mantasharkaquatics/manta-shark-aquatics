import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser, serviceClient } from '@/lib/api-auth'
import { getCoachBlocks, blockedIntervalsFor } from '@/lib/availability'
import { getEffectiveZones } from '@/lib/zones'
import { renewalHolds, minToTime } from '@/lib/fixed-classes'

// Who may read a coach's booked times (2026-10-04). This route used to answer
// anyone, logged in or not, with every booked student's id and -- given any
// student_id -- that child's lessons with every coach that day. Now: a parent,
// an active coach or an admin. Staff see everything as before; a parent sees
// the coach's busy times, but student ids and the per-student busy list only
// for their OWN children (what the booking page needs to grey out a clash).
async function resolveCaller(svc: ReturnType<typeof serviceClient>) {
  const user = await getAuthUser()
  if (!user) return null
  const [{ data: admin }, { data: coach }, { data: parent }] = await Promise.all([
    svc.from('admins').select('id').eq('auth_user_id', user.id).maybeSingle(),
    svc.from('coaches').select('id').eq('auth_user_id', user.id).eq('is_active', true).maybeSingle(),
    svc.from('parents').select('id').eq('auth_user_id', user.id).maybeSingle(),
  ])
  if (admin || coach) return { staff: true as const, parentId: null }
  if (parent) return { staff: false as const, parentId: parent.id as string }
  return null
}

export async function GET(req: NextRequest) {
  const supabase = serviceClient()
  const caller = await resolveCaller(supabase)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const coach_id = searchParams.get('coach_id')
  const session_date = searchParams.get('session_date')

  if (!coach_id || !session_date) return NextResponse.json({ times: [], blocked: [] })

  // A parent's own children: the only student ids a parent caller gets back.
  let ownStudents: Set<string> | null = null
  if (!caller.staff) {
    const { data: kids } = await supabase.from('students').select('id').eq('parent_id', caller.parentId)
    ownStudents = new Set((kids || []).map((k: any) => k.id))
  }

  // The student's own lessons that day with ANY coach, so the picker can grey out clashes.
  // A parent asking about someone else's child gets no student list (the filter
  // is ignored rather than refused, so the coach's own times still load).
  const rawStudentId = searchParams.get('student_id')
  const student_id = rawStudentId && (caller.staff || ownStudents?.has(rawStudentId)) ? rawStudentId : null
  let studentBusy: { start: string; end: string }[] = []
  if (student_id) {
    const { data: myBookings } = await supabase
      .from('bookings')
      .select('class_session_id')
      .eq('student_id', student_id)
      .not('status', 'in', '("cancelled","pending_partner")')
    const myIds = (myBookings || []).map((b: any) => b.class_session_id).filter(Boolean)
    if (myIds.length > 0) {
      const { data: mySessions } = await supabase
        .from('class_sessions')
        .select('start_time, end_time')
        .in('id', myIds)
        .eq('session_date', session_date)
      studentBusy = (mySessions || [])
        .filter((x: any) => x.start_time && x.end_time)
        .map((x: any) => ({ start: x.start_time.slice(0, 5), end: x.end_time.slice(0, 5) }))
    }
  }

  const coachBlocks = await getCoachBlocks(supabase, [coach_id], session_date)
  const blocked = blockedIntervalsFor(coachBlocks, coach_id)
  const zones = await getEffectiveZones(supabase, coach_id, session_date)

  // A coach with no zone rows is still on the old coach_availability table, and
  // that day has to be resolved HERE. The booking page used to read the table
  // straight from the browser with the publishable key: if RLS blocks it the
  // query returns an empty array rather than an error, the page finds zero
  // windows, and the parent is shown "no times" for a coach who is working all
  // day. Same service client as everything else this route returns.
  let legacyWindows: { start_time: string; end_time: string }[] = []
  if (zones.legacy) {
    const dow = new Date(session_date + 'T00:00:00Z').getUTCDay()
    const { data: avail } = await supabase
      .from('coach_availability')
      .select('start_time, end_time')
      .eq('coach_id', coach_id)
      .eq('day_of_week', dow)
      .eq('is_active', true)
    legacyWindows = (avail || []).map((a: any) => ({
      start_time: String(a.start_time).slice(0, 5),
      end_time: String(a.end_time).slice(0, 5),
    }))
  }

  // Other families' renewal holds (lib/fixed-classes) this coach has that
  // day, reported as busy times so the coach-filtered booking view greys them
  // out; they used to read as free (found 2026-10-05). This view serves the
  // private, 1-on-2 and assessment calendars (the group calendar reads
  // bookings/group-classes), and to all of those any overlapping hold is the
  // whole slot. Same entry shape as a booking, with no student or session.
  const holds = (await renewalHolds(supabase, session_date, session_date, caller.parentId))
    .filter(h => h.coachId === coach_id && h.date === session_date)
  const heldTimes = holds.map(h => ({
    time: minToTime(h.startMin), end: minToTime(h.endMin),
    student_id: null, course_type_id: h.courseTypeId, session_id: null,
  }))

  // Step 1: find all class_sessions for this coach on this date
  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('id, start_time, end_time, course_type_id')
    .eq('coach_id', coach_id)
    .eq('session_date', session_date)

  if (!sessions || sessions.length === 0) return NextResponse.json({ times: heldTimes, blocked, zones, studentBusy, legacyWindows })

  const sessionIds = sessions.map(s => s.id)
  const sessionMap: Record<string, any> = {}
  for (const s of sessions) sessionMap[s.id] = s

  // Step 2: find all active bookings for those sessions. A 1-on-2 invitation
  // still open (pending_partner, inside its 15 minutes) holds its seats too:
  // the booking routes refuse the time, so it is not shown as free. It is
  // reported without a student -- nobody is booked there yet.
  const nowMs = Date.now()
  const { data: rawBookings } = await supabase
    .from('bookings')
    .select('student_id, class_session_id, status, pending_expires_at')
    .in('class_session_id', sessionIds)
    .neq('status', 'cancelled')
  const bookings = (rawBookings || []).filter((b: any) =>
    b.status !== 'pending_partner' || (!!b.pending_expires_at && Date.parse(b.pending_expires_at) > nowMs))

  const times = bookings.map((b: any) => {
    const s = sessionMap[b.class_session_id]
    return {
      time: s?.start_time?.slice(0, 5),
      end: s?.end_time?.slice(0, 5),
      student_id: b.status === 'pending_partner' || (ownStudents && !ownStudents.has(b.student_id)) ? null : b.student_id,
      course_type_id: s?.course_type_id,
      session_id: b.class_session_id,
      // An open invitation's seat: the session reads as full on the booking page.
      ...(b.status === 'pending_partner' ? { held: true } : {}),
    }
  }).filter(x => x.time)

  return NextResponse.json({ times: [...times, ...heldTimes], blocked, zones, studentBusy, legacyWindows })
}
