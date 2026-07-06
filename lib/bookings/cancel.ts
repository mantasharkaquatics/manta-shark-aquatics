import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { formatTime12h } from '@/lib/date'

export type CancelResult = {
  ok: boolean
  status: number
  error?: string
  cancelledBookingIds: string[]
}

// Cancels one booking plus any same-account and cross-account partner bookings
// in the same time slot, refunds credits via atomic RPCs, and emails all
// affected parents. Idempotent: every status flip is a conditional update, so
// concurrent duplicate calls cannot double-refund.
export async function cancelBookingWithPartner(
  svc: SupabaseClient,
  bookingId: string,
  callerParentId: string | null
): Promise<CancelResult> {
  const { data: booking } = await svc
    .from('bookings')
    .select('id, class_session_id, lesson_credit_id, parent_id, student_id, status')
    .eq('id', bookingId)
    .single()

  if (!booking) return { ok: false, status: 404, error: 'Not found', cancelledBookingIds: [] }
  if (booking.status === 'pending_payment') {
    // Unpaid trial holds are only released by Stripe checkout expiry (30 min),
    // so a live payment link can never point at a cancelled booking.
    return { ok: false, status: 409, error: 'This booking is awaiting payment and will release automatically if unpaid', cancelledBookingIds: [] }
  }
  if (callerParentId && booking.parent_id !== callerParentId) {
    return { ok: false, status: 403, error: 'Forbidden', cancelledBookingIds: [] }
  }

  // Idempotent claim on the primary booking
  const { data: claimed } = await svc
    .from('bookings')
    .update({ status: 'cancelled', pending_action: null, cancellation_reason: 'cancelled_by_parent', cancelled_by: 'parent' })
    .eq('id', bookingId)
    .neq('status', 'cancelled')
    .select('id')
  if (!claimed || claimed.length === 0) {
    return { ok: false, status: 409, error: 'Already cancelled', cancelledBookingIds: [] }
  }

  const cancelledBookingIds: string[] = [booking.id]
  const cancelledPartners: { parent_id: string; student_id: string }[] = []

  if (booking.lesson_credit_id) {
    await svc.rpc('decrement_used_credits', { credit_id: booking.lesson_credit_id })
  }

  // Same-account 1-on-2: cancel sibling bookings on the same session
  const { data: sameParentBookings } = await svc
    .from('bookings')
    .select('id, lesson_credit_id, class_session_id')
    .eq('parent_id', booking.parent_id)
    .eq('class_session_id', booking.class_session_id)
    .neq('id', bookingId)
    .neq('status', 'cancelled')
    .neq('status', 'pending_payment')

  for (const pb of sameParentBookings || []) {
    const { data: c } = await svc
      .from('bookings')
      .update({ status: 'cancelled', pending_action: null, cancellation_reason: 'cancelled_by_parent', cancelled_by: 'parent' })
      .eq('id', pb.id)
      .neq('status', 'cancelled')
      .select('id')
    if (!c || c.length === 0) continue
    cancelledBookingIds.push(pb.id)
    if (pb.lesson_credit_id) {
      await svc.rpc('decrement_used_credits', { credit_id: pb.lesson_credit_id })
    }
  }

  // Cross-account partner: bookings on any session with same date + time + coach
  const { data: session } = await svc
    .from('class_sessions')
    .select('session_date, start_time, coach_id')
    .eq('id', booking.class_session_id)
    .single()

  if (session) {
    const { data: sameSessions } = await svc
      .from('class_sessions')
      .select('id')
      .eq('session_date', session.session_date)
      .eq('start_time', session.start_time)
      .eq('coach_id', session.coach_id)

    const sessionIds = (sameSessions || []).map((s: any) => s.id)

    if (sessionIds.length > 0) {
      const { data: partnerBookings } = await svc
        .from('bookings')
        .select('id, lesson_credit_id, class_session_id, parent_id, student_id')
        .neq('parent_id', booking.parent_id)
        .in('class_session_id', sessionIds)
        .neq('status', 'cancelled')
        .neq('status', 'pending_payment')

      for (const pb of partnerBookings || []) {
        const { data: c } = await svc
          .from('bookings')
          .update({ status: 'cancelled', pending_action: null, cancellation_reason: 'cancelled_by_parent', cancelled_by: 'parent' })
          .eq('id', pb.id)
          .neq('status', 'cancelled')
          .select('id')
        if (!c || c.length === 0) continue
        cancelledBookingIds.push(pb.id)
        cancelledPartners.push({ parent_id: pb.parent_id, student_id: pb.student_id })
        if (pb.lesson_credit_id) {
          await svc.rpc('decrement_used_credits', { credit_id: pb.lesson_credit_id })
        }
      }
    }
  }

  // Notify cancelling parent + cross-account partner parents (best effort)
  try {
    const { data: sess2 } = await svc
      .from('class_sessions')
      .select('session_date, start_time, end_time, course_type_id, coach_id')
      .eq('id', booking.class_session_id)
      .single()
    if (sess2) {
      const { data: ct } = await svc.from('course_types').select('name').eq('id', sess2.course_type_id).single()
      const { data: coach } = await svc.from('coaches').select('first_name, last_name').eq('id', sess2.coach_id).single()
      const coachName = coach ? (coach.first_name + ' ' + (coach.last_name || '')).trim() : ''
      const timeStr = formatTime12h(sess2.start_time) + ' \u2013 ' + formatTime12h(sess2.end_time)
      const targets: { parent_id: string; student_id: string }[] = [
        { parent_id: booking.parent_id, student_id: booking.student_id },
        ...cancelledPartners,
      ]
      const seen = new Set<string>()
      for (const t of targets) {
        if (!t.parent_id || seen.has(t.parent_id)) continue
        seen.add(t.parent_id)
        const { data: p } = await svc.from('parents').select('first_name, email').eq('id', t.parent_id).single()
        const { data: s } = await svc.from('students').select('full_name').eq('id', t.student_id).single()
        if (p?.email) {
          await sendEmail({
            type: 'booking_cancelled',
            to: p.email,
            parentName: p.first_name,
            studentName: s?.full_name || '',
            courseName: ct?.name || '',
            coachName,
            date: sess2.session_date,
            time: timeStr,
          })
        }
      }
    }
  } catch {}

  return { ok: true, status: 200, cancelledBookingIds }
}
