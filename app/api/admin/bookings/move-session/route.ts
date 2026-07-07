import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { sendEmail } from '@/lib/email'

function t12(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  return (h % 12 || 12) + ':' + String(m).padStart(2, '0') + ' ' + ap
}

export async function POST(req: NextRequest) {
  const adminCtx = await requireAdmin()
  if (!adminCtx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const svc = adminCtx.svc

  const { session_id, coach_id, date, time } = await req.json()
  if (!session_id || !coach_id || !date || !time)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const { data: sess } = await svc
    .from('class_sessions')
    .select('id, coach_id, course_type_id, session_date, start_time, status')
    .eq('id', session_id).single()
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (sess.coach_id === coach_id && sess.session_date === date && sess.start_time.slice(0, 5) === time.slice(0, 5))
    return NextResponse.json({ error: 'New time is the same as the current time' }, { status: 400 })

  // Only fully-confirmed sessions are movable (pending_payment carries Stripe state)
  const { data: activeBookings } = await svc
    .from('bookings')
    .select('id, parent_id, student_id, status')
    .eq('class_session_id', session_id)
    .not('status', 'in', '(cancelled,pending_partner)')
  if (!activeBookings || activeBookings.length === 0)
    return NextResponse.json({ error: 'No active bookings on this session' }, { status: 400 })
  if (activeBookings.some((b: any) => b.status !== 'confirmed'))
    return NextResponse.json({ error: 'Session has bookings awaiting payment or confirmation and cannot be moved' }, { status: 400 })

  // Target conflict: any session with students at that coach/date/time
  const { data: conflicts } = await svc
    .from('class_sessions').select('id')
    .eq('coach_id', coach_id).eq('session_date', date).eq('start_time', time)
    .in('status', ['open', 'full']).gt('enrolled_count', 0)
    .neq('id', session_id)
  if (conflicts && conflicts.length > 0)
    return NextResponse.json({ error: 'The coach already has another lesson at this time' }, { status: 400 })

  const { data: course } = await svc
    .from('course_types').select('name, duration_minutes').eq('id', sess.course_type_id).single()
  if (!course) return NextResponse.json({ error: 'Course type not found' }, { status: 500 })

  const [h, m] = time.split(':').map(Number)
  const endMins = h * 60 + m + course.duration_minutes
  const endTime = String(Math.floor(endMins / 60)).padStart(2, '0') + ':' + String(endMins % 60).padStart(2, '0')

  // Atomic move: single row update, bookings follow automatically
  const { error: updErr } = await svc
    .from('class_sessions')
    .update({ coach_id, session_date: date, start_time: time, end_time: endTime })
    .eq('id', session_id)
  if (updErr)
    return NextResponse.json({ error: 'Move failed: ' + updErr.message }, { status: 500 })

  // Notify every affected parent (cross-account included)
  try {
    const parentIds = [...new Set(activeBookings.map((b: any) => b.parent_id))]
    const studentIds = [...new Set(activeBookings.map((b: any) => b.student_id))]
    const [{ data: parents }, { data: students }, { data: coach }] = await Promise.all([
      svc.from('parents').select('id, first_name, email').in('id', parentIds),
      svc.from('students').select('id, full_name, parent_id').in('id', studentIds),
      svc.from('coaches').select('first_name, last_name').eq('id', coach_id).single(),
    ])
    for (const pa of parents || []) {
      if (!pa.email) continue
      const names = (students || []).filter((st: any) => st.parent_id === pa.id).map((st: any) => st.full_name).join(', ')
      await sendEmail({
        type: 'booking_rescheduled',
        to: pa.email,
        parentName: pa.first_name,
        studentName: names,
        courseName: course.name,
        coachName: coach ? (coach.first_name + ' ' + (coach.last_name || '')).trim() : '',
        date,
        time: t12(time) + ' – ' + t12(endTime),
      })
    }
  } catch (e) {
    console.error('Move-session email error:', e)
  }

  return NextResponse.json({ success: true })
}
