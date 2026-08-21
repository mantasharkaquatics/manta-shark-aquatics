import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCoachBlocks, blockedIntervalsFor } from '@/lib/availability'
import { getEffectiveZones } from '@/lib/zones'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const coach_id = searchParams.get('coach_id')
  const session_date = searchParams.get('session_date')

  if (!coach_id || !session_date) return NextResponse.json({ times: [], blocked: [] })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // The student's own lessons that day with ANY coach, so the picker can grey out clashes
  const student_id = searchParams.get('student_id')
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

  // Step 1: find all class_sessions for this coach on this date
  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('id, start_time, end_time, course_type_id')
    .eq('coach_id', coach_id)
    .eq('session_date', session_date)

  if (!sessions || sessions.length === 0) return NextResponse.json({ times: [], blocked, zones, studentBusy, legacyWindows })

  const sessionIds = sessions.map(s => s.id)
  const sessionMap: Record<string, any> = {}
  for (const s of sessions) sessionMap[s.id] = s

  // Step 2: find all active bookings for those sessions
  const { data: bookings } = await supabase
    .from('bookings')
    .select('student_id, class_session_id')
    .in('class_session_id', sessionIds)
    .not('status', 'in', '("cancelled","pending_partner")')

  const times = (bookings || []).map(b => {
    const s = sessionMap[b.class_session_id]
    return {
      time: s?.start_time?.slice(0, 5),
      end: s?.end_time?.slice(0, 5),
      student_id: b.student_id,
      course_type_id: s?.course_type_id,
      session_id: b.class_session_id
    }
  }).filter(x => x.time)

  return NextResponse.json({ times, blocked, zones, studentBusy, legacyWindows })
}
