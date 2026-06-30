import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

function getLANow() {
  const now = new Date()
  const laString = now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })
  return new Date(laString)
}

function pad(n: number) { return String(n).padStart(2, '0') }

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: admin } = await supabase
    .from('admins')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { student_id, check_in_method } = await req.json()
  if (!student_id) return NextResponse.json({ error: 'Missing student_id' }, { status: 400 })

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, current_level')
    .eq('id', student_id)
    .single()

  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

  const laNow = getLANow()
  const today = pad(laNow.getFullYear() < 1000 ? laNow.getFullYear() : laNow.getFullYear()) + '-' + pad(laNow.getMonth() + 1) + '-' + pad(laNow.getDate())
  const todayStr = laNow.getFullYear() + '-' + pad(laNow.getMonth() + 1) + '-' + pad(laNow.getDate())

  const { data: settingRow } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'checkin_period_cutoff')
    .single()
  const cutoff = settingRow?.value || '12:00'

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, class_session_id, status, class_sessions(session_date, start_time, end_time)')
    .eq('student_id', student_id)
    .neq('status', 'cancelled')

  const todayBookings = (bookings || []).filter((b: any) => {
    const cs = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
    return cs?.session_date === todayStr
  })

  if (todayBookings.length === 0) {
    return NextResponse.json({ error: student.full_name + ' \u4eca\u5929\u6c92\u6709\u8ab2\u7a0b' }, { status: 404 })
  }

  const nowMinutes = laNow.getHours() * 60 + laNow.getMinutes()

  const eligible = todayBookings.find((b: any) => {
    const cs = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
    if (!cs?.start_time) return false
    const parts = cs.start_time.split(':').map(Number)
    const classMinutes = parts[0] * 60 + parts[1]
    return Math.abs(classMinutes - nowMinutes) <= 30
  })

  if (!eligible) {
    return NextResponse.json({ error: student.full_name + ' \u73fe\u5728\u6c92\u6709\u53ef\u5831\u5230\u7684\u8ab2\u7a0b\uff08\u9700\u5728\u8ab2\u7a0b\u524d\u5f8c 30 \u5206\u9418\u5167\uff09' }, { status: 400 })
  }

  const eligibleCs = Array.isArray(eligible.class_sessions) ? eligible.class_sessions[0] : eligible.class_sessions
  const cutoffParts = cutoff.split(':').map(Number)
  const cutoffMinutes = cutoffParts[0] * 60 + cutoffParts[1]
  const eParts = eligibleCs.start_time.split(':').map(Number)
  const eligiblePeriod = (eParts[0] * 60 + eParts[1]) < cutoffMinutes ? 'AM' : 'PM'

  const periodBookings = todayBookings.filter((b: any) => {
    const cs = Array.isArray(b.class_sessions) ? b.class_sessions[0] : b.class_sessions
    if (!cs?.start_time) return false
    const parts = cs.start_time.split(':').map(Number)
    const period = (parts[0] * 60 + parts[1]) < cutoffMinutes ? 'AM' : 'PM'
    return period === eligiblePeriod
  })

  const now = new Date()
  const rows = periodBookings.map((b: any) => ({
    booking_id: b.id,
    student_id: student.id,
    class_session_id: b.class_session_id,
    check_in_method: check_in_method === 'qr_code' ? 'qr_code' : 'manual',
    checked_in_by: null,
    checked_in_at: now.toISOString(),
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
    period: eligiblePeriod,
  })
}
