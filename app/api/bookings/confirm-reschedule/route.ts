import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { readJson, badRequest } from '@/lib/http'
import { studentsBusyAt } from '@/lib/bookings/student-clash'
import { mailRescheduleDone, mailRescheduleNotMoved } from '@/lib/bookings/partner-reschedule-mail'
import { sessionsHeldByInvites } from '@/lib/bookings/invite-holds'
import { getTodayLA, getNowMinutesLA, minutesUntil } from '@/lib/date'
import { LEAD_TIME_MINUTES } from '@/lib/booking-time'
import { getCoachBlocks, isBlocked } from '@/lib/availability'

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  if (!body) return badRequest()
  const { booking_id } = body

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await supabase
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch own booking (must be pending reschedule). Only the family who was
  // ASKED can confirm: the family who proposed the move holds
  // 'reschedule_initiator', and accepting that let them move the other
  // family's child on their own (found 2026-10-03).
  const { data: myBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, status, partner_booking_id, points_charged, points_granted, points_granted_expires_at, pending_new_session_id, pending_action, pending_expires_at, original_booking_id')
    .eq('id', booking_id)
    .eq('pending_action', 'reschedule')
    .single()

  if (!myBooking) return NextResponse.json({ error: 'Booking not found or in the wrong state' }, { status: 404 })
  if (myBooking.parent_id !== parent.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!myBooking.pending_new_session_id) return NextResponse.json({ error: 'No pending new time slot to confirm' }, { status: 400 })

  const partnerBookingId = myBooking.partner_booking_id
  if (!partnerBookingId) return NextResponse.json({ error: 'Partner booking not found' }, { status: 404 })

  const { data: partnerBooking } = await supabase
    .from('bookings')
    .select('id, class_session_id, parent_id, student_id, status, points_charged, points_granted, points_granted_expires_at, pending_new_session_id, pending_action, original_booking_id')
    .eq('id', partnerBookingId)
    .single()

  if (!partnerBooking) return NextResponse.json({ error: 'Partner booking not found' }, { status: 404 })
  // The other side must be the one that asked, for this same new time, and
  // the request must not have run out.
  if (partnerBooking.pending_action !== 'reschedule_initiator'
      || partnerBooking.pending_new_session_id !== myBooking.pending_new_session_id
      || partnerBooking.parent_id === myBooking.parent_id)
    return NextResponse.json({ error: 'This reschedule has already been dealt with.' }, { status: 409 })
  if (myBooking.pending_expires_at && new Date(myBooking.pending_expires_at) < new Date())
    return NextResponse.json({ error: 'This reschedule has already been dealt with.' }, { status: 409 })

  const newSessionId = myBooking.pending_new_session_id

  // Fetch the new session
  const { data: newSession } = await supabase
    .from('class_sessions')
    .select('id, enrolled_count, max_students, coach_id, session_date, start_time, end_time, course_type_id')
    .eq('id', newSessionId)
    .single()

  if (!newSession) return NextResponse.json({ error: 'New time slot not found' }, { status: 404 })

  // The 30-minute lead time and the coach's time off, judged now rather than
  // only when the request was sent (found 2026-10-08): a move asked for 40
  // minutes ahead and accepted 15 minutes later landed inside 30 minutes, and
  // time off entered meanwhile was never looked at. Owner, 2026-10-08: the
  // request lapses and both families are told; the lesson keeps its time.
  {
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    const [sh, sm] = String(newSession.start_time).slice(0, 5).split(':').map(Number)
    const endT = (newSession as any).end_time || hhmm(sh * 60 + sm + 30)
    const tooLate = minutesUntil(newSession.session_date, newSession.start_time, getTodayLA(), getNowMinutesLA()) < LEAD_TIME_MINUTES
    const off = !tooLate && isBlocked(await getCoachBlocks(supabase as any, [newSession.coach_id], newSession.session_date),
      newSession.coach_id, newSession.start_time, endT)
    if (tooLate || off) {
      await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.id)
      await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', partnerBookingId)
      await mailRescheduleNotMoved(supabase, { bookingIds: [myBooking.id, partnerBookingId], newSessionId, outcome: tooLate ? 'too_late' : 'coach_unavailable' })
      return NextResponse.json({
        error: tooLate
          ? 'The new time now starts in less than 30 minutes, so the lesson cannot be moved there; the original time is kept'
          : 'The coach is no longer available at the new time; reschedule failed and the original time is kept',
      }, { status: 409 })
    }
  }

  // Race protection: check new session capacity. A 1-on-2 invitation still
  // waiting for its answer holds the session too (lib/bookings/invite-holds).
  if (newSession.enrolled_count + 2 > newSession.max_students
      || (await sessionsHeldByInvites(supabase as any, [newSession.id])).has(newSession.id)) {
    // Clear both sides' pending state, keep the original time
    await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.id)
    await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', partnerBookingId)
    await mailRescheduleNotMoved(supabase, { bookingIds: [myBooking.id, partnerBookingId], newSessionId, outcome: 'unavailable' })
    return NextResponse.json({ error: 'The new time slot was just booked; reschedule failed and the original time is kept' }, { status: 409 })
  }

  // Race protection: check coach conflicts -- any session of the coach that
  // OVERLAPS the new one, not only one starting at the same minute (a
  // 60-minute lesson's second half starts off the grid).
  const toMinR = (t: string) => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return h * 60 + m }
  const { data: daySessions } = await supabase
    .from('class_sessions')
    .select('id, start_time, end_time')
    .eq('coach_id', newSession.coach_id)
    .eq('session_date', newSession.session_date)
    .neq('id', newSession.id)
    .neq('status', 'cancelled')
  const ns = toMinR(newSession.start_time)
  const ne = (newSession as any).end_time ? toMinR((newSession as any).end_time) : ns + 30
  const conflictIds = (daySessions || [])
    .filter((s: any) => { const s0 = toMinR(s.start_time); const e0 = s.end_time ? toMinR(s.end_time) : s0 + 30; return ns < e0 && ne > s0 })
    .map((s: any) => s.id)
  if (conflictIds.length > 0) {
    const { data: conflictBookings } = await supabase
      .from('bookings').select('id')
      .in('class_session_id', conflictIds)
      .not('status', 'in', '("cancelled","pending_partner")')
    const heldNear = await sessionsHeldByInvites(supabase as any, conflictIds)
    if ((conflictBookings && conflictBookings.length > 0) || heldNear.size > 0) {
      await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.id)
      await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', partnerBookingId)
      await mailRescheduleNotMoved(supabase, { bookingIds: [myBooking.id, partnerBookingId], newSessionId, outcome: 'unavailable' })
      return NextResponse.json({ error: 'The coach already has another booking at the new time; reschedule failed and the original time is kept' }, { status: 409 })
    }
  }

  // Both swimmers' own lessons at the new time, by the same overlap rule
  // (found 2026-10-07). Only the database's insert guard stood here, which
  // undid the move with a message that did not say which child was busy.
  // The lesson being moved does not count against itself.
  {
    const busy = await studentsBusyAt(supabase, [myBooking.student_id, partnerBooking.student_id], newSession.session_date,
      [{ s: ns, e: ne }], [myBooking.class_session_id, partnerBooking.class_session_id])
    if (busy.length > 0) {
      const { data: who } = await supabase.from('students').select('full_name').in('id', busy)
      const names = (who || []).map((x: any) => x.full_name).filter(Boolean).join(' & ') || 'One of the swimmers'
      await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', myBooking.id)
      await supabase.from('bookings').update({ pending_action: null, pending_new_session_id: null }).eq('id', partnerBookingId)
      await mailRescheduleNotMoved(supabase, { bookingIds: [myBooking.id, partnerBookingId], newSessionId, outcome: 'unavailable' })
      return NextResponse.json({ error: `${names} already has a lesson at the new time; reschedule failed and the original time is kept` }, { status: 409 })
    }
  }

  // A 1-on-2 belongs to two families, so this moves four rows: two cancelled,
  // two created. It used to cancel both, insert both WITHOUT reading the
  // error, and answer success either way. When the second insert hit the
  // database's own "this swimmer is already booked then" guard, both families
  // lost their lesson, one new booking stood alone, nobody was refunded, and
  // the API said it had worked.
  //
  // So: claim the old rows, create the new ones, and put everything back if
  // anything refuses. Claiming first also makes a double-click harmless -- the
  // second request finds nothing left to claim instead of making a second pair.
  const OLD_PATCH = {
    status: 'cancelled', cancellation_reason: 'rescheduled',
    pending_action: null, pending_expires_at: null,
  }

  /** Undo everything this request did, in the reverse order it did it. */
  const putBack = async (newIds: string[], oldIds: string[]) => {
    if (newIds.length > 0) {
      const { error } = await supabase.from('bookings').delete().in('id', newIds)
      if (error) console.error('confirm-reschedule: could not remove the half-made booking:', error.message)
    }
    const { error } = await supabase.from('bookings')
      .update({ status: 'confirmed', cancellation_reason: null, pending_new_session_id: null })
      .in('id', oldIds).eq('status', 'cancelled')
    if (error) {
      console.error(
        `\u26a0\ufe0f confirm-reschedule: could not restore bookings ${oldIds.join(', ')} after a failed ` +
        `reschedule. Those lessons are cancelled with nobody refunded -- fix by hand:`, error.message)
    }
  }

  const { data: claimedMine } = await supabase.from('bookings')
    .update(OLD_PATCH).eq('id', myBooking.id).eq('status', 'confirmed').select('id')
  if (!claimedMine || claimedMine.length === 0) {
    return NextResponse.json({ error: 'This reschedule has already been dealt with.' }, { status: 409 })
  }

  const { data: claimedPartner } = await supabase.from('bookings')
    .update(OLD_PATCH).eq('id', partnerBookingId).eq('status', 'confirmed').select('id')
  if (!claimedPartner || claimedPartner.length === 0) {
    await putBack([], [myBooking.id])
    return NextResponse.json({ error: 'This reschedule has already been dealt with.' }, { status: 409 })
  }

  const oldIds = [myBooking.id, partnerBookingId]

  // Each side carries its own family's original charge forward untouched: a
  // reschedule is the same lesson at a new time, so nobody is re-priced -- not
  // up when the new slot is peak, not down when it is off-peak. Re-pricing
  // downward would make "move the lesson" a way to buy the off-peak discount
  // after the fact.
  const now = new Date().toISOString()
  // original_booking_id: if the old booking was itself rescheduled, trace back to the origin
  const myOriginalId = myBooking.original_booking_id || myBooking.id
  const partnerOriginalId = partnerBooking.original_booking_id || partnerBooking.id

  const { data: newMyBooking, error: myErr } = await supabase.from('bookings').insert({
    class_session_id: newSessionId,
    parent_id: myBooking.parent_id,
    student_id: myBooking.student_id,
    points_charged: myBooking.points_charged,
    points_granted: myBooking.points_granted ?? 0,
    points_granted_expires_at: myBooking.points_granted_expires_at ?? null,
    status: 'confirmed',
    pending_action: null,
    original_booking_id: myOriginalId,
    created_at: now,
  }).select('id').single()

  if (myErr || !newMyBooking) {
    await putBack([], oldIds)
    await mailRescheduleNotMoved(supabase, { bookingIds: oldIds, newSessionId, outcome: 'unavailable' })
    console.error('confirm-reschedule: first booking failed:', myErr?.message)
    return NextResponse.json({
      error: 'That time could not be booked, so both lessons have been left where they were. Please pick another time.',
    }, { status: 409 })
  }

  const { data: newPartnerBooking, error: partnerErr } = await supabase.from('bookings').insert({
    class_session_id: newSessionId,
    parent_id: partnerBooking.parent_id,
    student_id: partnerBooking.student_id,
    points_charged: partnerBooking.points_charged,
    points_granted: partnerBooking.points_granted ?? 0,
    points_granted_expires_at: partnerBooking.points_granted_expires_at ?? null,
    status: 'confirmed',
    pending_action: null,
    original_booking_id: partnerOriginalId,
    created_at: now,
  }).select('id').single()

  if (partnerErr || !newPartnerBooking) {
    // The half that DID go in comes out again. Half a 1-on-2 is not a lesson,
    // and leaving it would put one swimmer alone in a slot the other family is
    // still paying for.
    await putBack([newMyBooking.id], oldIds)
    await mailRescheduleNotMoved(supabase, { bookingIds: oldIds, newSessionId, outcome: 'unavailable' })
    console.error('confirm-reschedule: partner booking failed:', partnerErr?.message)
    return NextResponse.json({
      error: 'That time could not be booked for both swimmers, so both lessons have been left where they were. Please pick another time.',
    }, { status: 409 })
  }

  // Point the two halves at each other. Failing here leaves two real bookings
  // at the right time that simply do not know they are partners -- worth
  // shouting about, not worth undoing a lesson over.
  const [{ error: linkA }, { error: linkB }] = await Promise.all([
    supabase.from('bookings').update({ partner_booking_id: newPartnerBooking.id }).eq('id', newMyBooking.id),
    supabase.from('bookings').update({ partner_booking_id: newMyBooking.id }).eq('id', newPartnerBooking.id),
  ])
  if (linkA || linkB) {
    console.error(
      `confirm-reschedule: bookings ${newMyBooking.id} and ${newPartnerBooking.id} were created but ` +
      `not linked as partners:`, linkA?.message || linkB?.message)
  }

  // Both families get the new time in writing (found 2026-10-07): neither
  // was told the move had happened.
  await mailRescheduleDone(supabase, { bookingIds: [newMyBooking.id, newPartnerBooking.id] })

  return NextResponse.json({
    success: true,
    booking_id: newMyBooking.id,
    partner_booking_id: newPartnerBooking.id,
  })
}
