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

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      students(full_name),
      class_sessions(session_date, start_time, course_types(name), coaches(first_name)),
      parents(phone, first_name)
    `)
    .eq('status', 'confirmed')
    .eq('class_sessions.session_date', tomorrowStr)

  if (error) {
    console.error('Error fetching bookings:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const results = []
  const accountSid = process.env.TWILIO_ACCOUNT_SID!
  const authToken = process.env.TWILIO_AUTH_TOKEN!
  const fromNumber = process.env.TWILIO_PHONE_NUMBER!

  for (const booking of (bookings || [])) {
    const parent = Array.isArray(booking.parents) ? booking.parents[0] : booking.parents
    const student = Array.isArray(booking.students) ? booking.students[0] : booking.students
    const session = Array.isArray(booking.class_sessions) ? booking.class_sessions[0] : booking.class_sessions
    const courseType = Array.isArray(session?.course_types) ? session.course_types[0] : session?.course_types
    const coach = Array.isArray(session?.coaches) ? session.coaches[0] : session?.coaches

    if (!parent?.phone) continue

    const time = formatTime(session?.start_time || '')
    const message = `Hi ${parent.first_name}! Reminder: ${student?.full_name} has a ${courseType?.name} lesson tomorrow at ${time} with Coach ${coach?.first_name}. See you then! - Manta Shark Aquatics`

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: fromNumber,
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
