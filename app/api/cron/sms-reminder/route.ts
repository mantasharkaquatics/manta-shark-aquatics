import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })

  // Step 1: tomorrow's sessions
  const { data: sessions, error: sessErr } = await supabase
    .from('class_sessions')
    .select('id, start_time, course_type_id, coach_id')
    .eq('session_date', tomorrowStr)

  if (sessErr) {
    console.error('Error fetching sessions:', sessErr)
    return NextResponse.json({ error: 'DB error (sessions)' }, { status: 500 })
  }
  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ sent: 0, results: [], note: 'no sessions tomorrow' })
  }
  const sessionMap = new Map(sessions.map((s) => [s.id, s]))

  // Step 2: confirmed bookings for those sessions
  const { data: bookings, error: bookErr } = await supabase
    .from('bookings')
    .select('id, class_session_id, student_id, parent_id')
    .eq('status', 'confirmed')
    .in('class_session_id', sessions.map((s) => s.id))

  if (bookErr) {
    console.error('Error fetching bookings:', bookErr)
    return NextResponse.json({ error: 'DB error (bookings)' }, { status: 500 })
  }
  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ sent: 0, results: [], note: 'no confirmed bookings tomorrow' })
  }

  // Step 3: batch lookups
  const uniq = (arr: (string | null)[]) => [...new Set(arr.filter(Boolean))] as string[]
  const studentIds = uniq(bookings.map((b) => b.student_id))
  const parentIds = uniq(bookings.map((b) => b.parent_id))
  const courseTypeIds = uniq(sessions.map((s) => s.course_type_id))
  const coachIds = uniq(sessions.map((s) => s.coach_id))

  const [studentsRes, parentsRes, courseTypesRes, coachesRes] = await Promise.all([
    supabase.from('students').select('id, full_name').in('id', studentIds),
    supabase.from('parents').select('id, phone, first_name').in('id', parentIds),
    supabase.from('course_types').select('id, name').in('id', courseTypeIds),
    supabase.from('coaches').select('id, first_name').in('id', coachIds),
  ])

  for (const [label, res] of [
    ['students', studentsRes],
    ['parents', parentsRes],
    ['course_types', courseTypesRes],
    ['coaches', coachesRes],
  ] as const) {
    if (res.error) {
      console.error(`Error fetching ${label}:`, res.error)
      return NextResponse.json({ error: `DB error (${label})` }, { status: 500 })
    }
  }

  const studentMap = new Map((studentsRes.data || []).map((r) => [r.id, r]))
  const parentMap = new Map((parentsRes.data || []).map((r) => [r.id, r]))
  const courseTypeMap = new Map((courseTypesRes.data || []).map((r) => [r.id, r]))
  const coachMap = new Map((coachesRes.data || []).map((r) => [r.id, r]))

  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID!

  const results: Array<Record<string, unknown>> = []

  for (const booking of bookings) {
    const session = sessionMap.get(booking.class_session_id)
    const parent = parentMap.get(booking.parent_id)
    const student = studentMap.get(booking.student_id)
    if (!session || !parent?.phone) continue

    const courseType = courseTypeMap.get(session.course_type_id)
    const coach = coachMap.get(session.coach_id)
    const time = formatTime(session.start_time || '')
    const message = `Hi ${parent.first_name}! Reminder: ${student?.full_name} has a ${courseType?.name} lesson tomorrow at ${time} with Coach ${coach?.first_name}. See you then! - Manta Shark Aquatics`

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            MessagingServiceSid: messagingServiceSid,
            To: parent.phone,
            Body: message,
          }),
        }
      )
      const data = await response.json()
      results.push({ booking_id: booking.id, status: data.status, to: parent.phone })
    } catch (err) {
      results.push({ booking_id: booking.id, error: String(err) })
    }
  }

  return NextResponse.json({ sent: results.length, results })
}

function formatTime(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}
