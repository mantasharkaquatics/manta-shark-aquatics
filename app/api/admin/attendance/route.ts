import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readJson, badRequest } from '@/lib/http'

export async function GET(req: NextRequest) {
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

  const bookingIdsParam = req.nextUrl.searchParams.get('booking_ids') || ''
  const bookingIds = bookingIdsParam.split(',').filter(Boolean)
  if (bookingIds.length === 0) return NextResponse.json({ checkedInBookingIds: [] })

  const { data, error } = await supabase
    .from('attendance')
    .select('booking_id')
    .in('booking_id', bookingIds)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ checkedInBookingIds: (data || []).map(d => d.booking_id) })
}

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

  const body = await readJson(req)
  if (!body) return badRequest()
  const { booking_id, student_id, checked_in } = body
  if (!booking_id) return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })

  // A 60-minute lesson is two linked bookings. Attendance follows the whole
  // group, the way cancellation and credits already do: ticking or un-ticking
  // one half would otherwise leave the other half silently absent, which also
  // drops it out of the Missing Progress list.
  //
  // THIS swimmer's halves only (found 2026-10-06). A 60-minute 1-on-2 shares
  // one lesson_group_id across every seat -- siblings, and both families of a
  // partner booking -- so ticking one child used to check in (or out) every
  // child in the lesson. The booking itself is read from the database rather
  // than trusted from the request.
  const { data: self } = await supabase.from('bookings')
    .select('id, lesson_group_id, student_id, class_session_id').eq('id', booking_id).maybeSingle()
  if (!self) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (student_id && self.student_id && student_id !== self.student_id)
    return NextResponse.json({ error: 'That booking is for another swimmer. Refresh and try again.' }, { status: 409 })
  let targets: any[] = [{ booking_id: self.id, student_id: self.student_id, class_session_id: self.class_session_id }]
  if (self.lesson_group_id) {
    const { data: halves } = await supabase.from('bookings')
      .select('id, student_id, class_session_id')
      .eq('lesson_group_id', self.lesson_group_id)
      .eq('student_id', self.student_id)
      .not('status', 'in', '("cancelled")')
    if (halves && halves.length > 0)
      targets = halves.map((h: any) => ({
        booking_id: h.id, student_id: h.student_id, class_session_id: h.class_session_id,
        is_chained: h.id !== booking_id,
      }))
  }

  if (checked_in) {
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('attendance').upsert(
      targets.map((t: any) => ({ ...t, check_in_method: 'manual', checked_in_by: null, checked_in_at: nowIso })),
      { onConflict: 'booking_id,student_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('attendance').delete().in('booking_id', targets.map((t: any) => t.booking_id))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
