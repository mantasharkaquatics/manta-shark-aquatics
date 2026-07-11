import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch own booking (must be pending reschedule)
  const { data: myBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, partner_booking_id, lesson_credit_id, pending_new_session_id, pending_action, original_booking_id')
    .eq('id', booking_id)
    .in('pending_action', ['reschedule', 'reschedule_initiator'])
    .single()

  if (!myBooking) return NextResponse.json({ error: 'Booking not found or in the wrong state' }, { status: 404 })
  if (myBooking.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!myBooking.pending_new_session_id) return NextResponse.json({ error: 'No pending new time slot to confirm' }, { status: 400 })

  const partnerBookingId = myBooking.partner_booking_id
  if (!partnerBookingId) return NextResponse.json({ error: 'Partner booking not found' }, { status: 404 })

  const { data: partnerBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, lesson_credit_id, pending_new_session_id, original_booking_id')
    .eq('id', partnerBookingId)
    .single()

  if (!partnerBooking) return NextResponse.json({ error: 'Partner booking not found' }, { status: 404 })

  const newSessionId = myBooking.pending_new_session_id

  // Fetch the new session
  const { data: newSession } = await supabase
    .from('class_sessions')
    .select('id, enrolled_count, max_students, coach_id, session_date, start_time, course_type_id')
    .eq('id', newSessionId)
    .single()

  if (!newSession) return NextResponse.json({ error: 'New time slot not found' }, { status: 404 })

  // Race protection: check new session capacity
  if (newSession.enrolled_count + 2 > newSession.max_students) {
    // Clear both sides' pending state, keep the original time
    await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.id)
    await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', partnerBookingId)
    return NextResponse.json({ error: 'The new time slot was just booked; reschedule failed and the original time is kept' }, { status: 409 })
  }

  // Race protection: check coach conflicts
  const { data: conflictSessions } = await supabase
    .from('class_sessions')
    .select('id')
    .eq('coach_id', newSession.coach_id)
    .eq('session_date', newSession.session_date)
    .eq('start_time', newSession.start_time)
    .neq('id', newSession.id)
  const conflictIds = (conflictSessions || []).map((s: any) => s.id)
  if (conflictIds.length > 0) {
    const { data: conflictBookings } = await supabase
      .from('bookings').select('id')
      .in('class_session_id', conflictIds)
      .not('status', 'in', '("cancelled","pending_partner")')
    if (conflictBookings && conflictBookings.length > 0) {
      await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.id)
      await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', partnerBookingId)
      return NextResponse.json({ error: 'The coach already has another booking at the new time; reschedule failed and the original time is kept' }, { status: 409 })
    }
  }

  // Cancel the old booking (keep pending_new_session_id as reschedule history, clear other pending fields)
  await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: 'rescheduled', pending_action: null, pending_expires_at: null }).eq('id', myBooking.id)
  await supabase.from('bookings').update({ status: 'cancelled', cancellation_reason: 'rescheduled', pending_action: null, pending_expires_at: null }).eq('id', partnerBookingId)


  // Create new bookings for both sides
  const now = new Date().toISOString()
  // original_booking_id: if the old booking was itself rescheduled, trace back to the origin
  const myOriginalId = myBooking.original_booking_id || myBooking.id
  const partnerOriginalId = partnerBooking.original_booking_id || partnerBooking.id

  const { data: newMyBooking } = await supabase.from('bookings').insert({
    class_session_id: newSessionId,
    parent_id: myBooking.parent_id,
    student_id: myBooking.student_id,
    lesson_credit_id: myBooking.lesson_credit_id,
    status: 'confirmed',
    pending_action: null,
    original_booking_id: myOriginalId,
    created_at: now,
  }).select('id').single()

  const { data: newPartnerBooking } = await supabase.from('bookings').insert({
    class_session_id: newSessionId,
    parent_id: partnerBooking.parent_id,
    student_id: partnerBooking.student_id,
    lesson_credit_id: partnerBooking.lesson_credit_id,
    status: 'confirmed',
    pending_action: null,
    original_booking_id: partnerOriginalId,
    created_at: now,
  }).select('id').single()

  // Set partner_booking_id on each other
  if (newMyBooking && newPartnerBooking) {
    await supabase.from('bookings').update({ partner_booking_id: newPartnerBooking.id }).eq('id', newMyBooking.id)
    await supabase.from('bookings').update({ partner_booking_id: newMyBooking.id }).eq('id', newPartnerBooking.id)
  }


  return NextResponse.json({ success: true })
}
