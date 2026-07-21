import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const WINDOW_START_H = 24.5
const WINDOW_END_H = 25.5

function laWallParts(d: Date) {
  const date = d.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'America/Los_Angeles', hour12: false })
  return { date, time }
}

function wallMs(dateStr: string, timeStr: string): number {
  return Date.parse(`${dateStr}T${timeStr}Z`)
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 25h window in LA wall-clock terms
  const now = new Date()
  const nowParts = laWallParts(now)
  const nowWall = wallMs(nowParts.date, nowParts.time)
  const winStart = nowWall + WINDOW_START_H * 3600000
  const winEnd = nowWall + WINDOW_END_H * 3600000
  const dateA = new Date(winStart).toISOString().slice(0, 10)
  const dateB = new Date(winEnd).toISOString().slice(0, 10)
  const candidateDates = dateA === dateB ? [dateA] : [dateA, dateB]

  // Step 1: sessions whose LA wall-clock start falls inside the window
  const { data: sessions, error: sessErr } = await supabase
    .from('class_sessions')
    .select('id, session_date, start_time, course_type_id, coach_id')
    .in('session_date', candidateDates)

  if (sessErr) {
    console.error('Error fetching sessions:', sessErr)
    return NextResponse.json({ error: 'DB error (sessions)' }, { status: 500 })
  }

  const inWindow = (sessions || []).filter((s) => {
    const t = wallMs(s.session_date, s.start_time || '00:00:00')
    return t >= winStart && t < winEnd
  })

  if (inWindow.length === 0) {
    return NextResponse.json({ sent: 0, results: [], note: 'no sessions in 25h window' })
  }
  const sessionMap = new Map(inWindow.map((s) => [s.id, s]))

  // Step 2: confirmed, not-yet-reminded bookings for those sessions
  const { data: bookings, error: bookErr } = await supabase
    .from('bookings')
    .select('id, class_session_id, student_id, parent_id')
    .eq('status', 'confirmed')
    .is('reminder_sent_at', null)
    .in('class_session_id', inWindow.map((s) => s.id))

  if (bookErr) {
    console.error('Error fetching bookings:', bookErr)
    return NextResponse.json({ error: 'DB error (bookings)' }, { status: 500 })
  }
  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ sent: 0, results: [], note: 'no unreminded bookings in window' })
  }

  // Step 3: batch lookups
  const uniq = (arr: (string | null)[]) => [...new Set(arr.filter(Boolean))] as string[]
  const studentIds = uniq(bookings.map((b) => b.student_id))
  const parentIds = uniq(bookings.map((b) => b.parent_id))
  const courseTypeIds = uniq(inWindow.map((s) => s.course_type_id))
  const coachIds = uniq(inWindow.map((s) => s.coach_id))

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
  let sent = 0

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
      if (response.ok && data.sid) {
        const { error: updErr } = await supabase
          .from('bookings')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', booking.id)
        if (updErr) console.error('Error stamping reminder_sent_at:', booking.id, updErr)
        sent += 1
        results.push({ booking_id: booking.id, status: data.status, to: parent.phone, stamped: !updErr })
      } else {
        results.push({ booking_id: booking.id, error: data.message || data.code || 'twilio rejected' })
      }
    } catch (err) {
      results.push({ booking_id: booking.id, error: String(err) })
    }
  }

  return NextResponse.json({ sent, results })
}

function formatTime(t: string): string {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}
