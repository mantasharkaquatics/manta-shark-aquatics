import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getTodayLA, getNowMinutesLA, formatTime12h } from '@/lib/date'

const EARLY_WINDOW_MIN = 30
const CHAIN_GAP_MIN = 30

function toMinutes(t: string): number {
  const parts = t.split(':').map(Number)
  return parts[0] * 60 + parts[1]
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = auth.svc

  const { student_id, check_in_method } = await req.json()
  if (!student_id) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, current_level')
    .eq('id', student_id)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const todayStr = getTodayLA()
  const nowMin = getNowMinutesLA()

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, class_session_id, status')
    .eq('student_id', student_id)
    .neq('status', 'cancelled')

  const sessionIds = Array.from(new Set((bookings || []).map((b: any) => b.class_session_id).filter(Boolean)))
  const { data: sessions } = sessionIds.length
    ? await supabase.from('class_sessions').select('id, session_date, start_time, end_time').in('id', sessionIds)
    : { data: [] as any[] }
  const sessionMap = new Map((sessions || []).map((s: any) => [s.id, s]))

  const todays = (bookings || [])
    .map((b: any) => ({ ...b, cs: sessionMap.get(b.class_session_id) || null }))
    .filter((b: any) => b.cs && b.cs.session_date === todayStr && b.cs.start_time && b.cs.end_time)
    .sort((a: any, b: any) => toMinutes(a.cs.start_time) - toMinutes(b.cs.start_time))

  if (todays.length === 0) {
    return NextResponse.json({ error: student.full_name + ' has no lessons today' }, { status: 404 })
  }

  const { data: existing } = await supabase
    .from('attendance')
    .select('booking_id')
    .in('booking_id', todays.map((b: any) => b.id))
  const attended = new Set((existing || []).map((r: any) => r.booking_id))

  // Anchor: earliest unattended booking whose window is open. Window = [start - 30 min, end)
  const anchorIdx = todays.findIndex((b: any) => {
    const s = toMinutes(b.cs.start_time)
    const e = toMinutes(b.cs.end_time)
    return !attended.has(b.id) && nowMin >= s - EARLY_WINDOW_MIN && nowMin < e
  })

  if (anchorIdx === -1) {
    return NextResponse.json({
      error: student.full_name + ' has no lesson open for check-in right now. Check-in opens 30 minutes before class and closes when the class ends.',
    }, { status: 400 })
  }

  // Chain forward: consecutive lessons with gap <= 30 min join the same check-in
  const chain: any[] = [todays[anchorIdx]]
  for (let i = anchorIdx + 1; i < todays.length; i++) {
    const prevEnd = toMinutes(chain[chain.length - 1].cs.end_time)
    const nextStart = toMinutes(todays[i].cs.start_time)
    if (nextStart - prevEnd <= CHAIN_GAP_MIN) {
      chain.push(todays[i])
    } else {
      break
    }
  }

  const nowIso = new Date().toISOString()
  const anchorId = todays[anchorIdx].id
  const targets = chain.filter((b: any) => !attended.has(b.id))
  const rows = targets.map((b: any) => ({
    booking_id: b.id,
    student_id: student.id,
    class_session_id: b.class_session_id,
    check_in_method: check_in_method === 'qr_code' ? 'qr_code' : 'manual',
    checked_in_by: null,
    checked_in_at: nowIso,
    is_chained: b.id !== anchorId,
  }))

  const { error } = await supabase
    .from('attendance')
    .upsert(rows, { onConflict: 'booking_id,student_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    student_id: student.id,
    student_name: student.full_name,
    current_level: student.current_level,
    checked_in_count: rows.length,
    lesson_times: targets.map((b: any) => formatTime12h(b.cs.start_time)),
  })
}
