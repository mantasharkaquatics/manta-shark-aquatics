import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const coach_id = searchParams.get('coach_id')
  const session_date = searchParams.get('session_date')

  if (!coach_id || !session_date) return NextResponse.json({ times: [] })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Step 1: 找此教練此日期的所有 class_sessions
  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('id, start_time, course_type_id')
    .eq('coach_id', coach_id)
    .eq('session_date', session_date)

  if (!sessions || sessions.length === 0) return NextResponse.json({ times: [] })

  const sessionIds = sessions.map(s => s.id)
  const sessionMap: Record<string, any> = {}
  for (const s of sessions) sessionMap[s.id] = s

  // Step 2: 找這些 sessions 的所有 active bookings
  const { data: bookings } = await supabase
    .from('bookings')
    .select('student_id, class_session_id')
    .in('class_session_id', sessionIds)
    .neq('status', 'cancelled')

  const times = (bookings || []).map(b => {
    const s = sessionMap[b.class_session_id]
    return {
      time: s?.start_time?.slice(0, 5),
      student_id: b.student_id,
      course_type_id: s?.course_type_id,
      session_id: b.class_session_id
    }
  }).filter(x => x.time)

  return NextResponse.json({ times })
}
