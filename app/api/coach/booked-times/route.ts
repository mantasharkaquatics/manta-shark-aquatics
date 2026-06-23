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

  const { data } = await supabase
    .from('bookings')
    .select('student_id, class_sessions!inner(start_time, course_type_id, id)')
    .eq('class_sessions.coach_id', coach_id)
    .eq('class_sessions.session_date', session_date)
    .neq('status', 'cancelled')

  const times = (data || []).map((b: any) => {
    const cs = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
    return { time: cs?.start_time?.slice(0, 5), student_id: b.student_id, course_type_id: cs?.course_type_id, session_id: cs?.id }
  }).filter(x => x.time)

  return NextResponse.json({ times })
}
