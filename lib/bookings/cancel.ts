import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { formatTime12h, getTodayLA, getNowMinutesLA, minutesUntil } from '@/lib/date'
import { getCancellationQuota, tokenExpiryFromNow } from '@/lib/tokens'

export type CancelResult = {
  ok: boolean
  status: number
  error?: string
  cancelledBookingIds: string[]
  convertedToToken?: boolean
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
    .select('id, class_session_id, lesson_credit_id, token_package_id, partner_booking_id, parent_id, student_id, status')
    .eq('id', bookingId)
    .single()

  if (!booking) return { ok: false, status: 404, error: 'Not found', cancelledBookingIds: [] }
  if (booking.status === 'pending_payment') {
    // Unpaid trial holds are only released by Stripe checkout expiry (30 min),
    // so a live payment link can never point at a cancelled booking.
    return { ok: false, status: 409, error: 'This booking is awaiting payment and will release automatically if unpaid', cancelledBookingIds: [] }
  }
  if (booking.status === 'in_cart') {
    // Cart holds are managed by the cart API (remove/clear) and auto-expire.
    return { ok: false, status: 409, error: 'This booking is in your cart. Remove it from the cart instead.', cancelledBookingIds: [] }
  }
  if (callerParentId && booking.parent_id !== callerParentId) {
    return { ok: false, status: 403, error: 'Forbidden', cancelledBookingIds: [] }
  }

  // Token-booked lessons are final (spec v1.1): no cancellation, no reschedule.
  if (booking.token_package_id) {
    return { ok: false, status: 400, error: 'Lessons booked with tokens cannot be cancelled.', cancelledBookingIds: [] }
  }

  // Parent-initiated cancellation within 24h: convert the spent credit to a
  // token (quota-gated) instead of refunding. Admin/system callers keep the
  // plain credit refund. 1-on-2 within 24h stays human-handled (v1 exclusion).
  let convertToToken = false
  let convertCourseTypeId: string | null = null
  if (callerParentId) {
    const { data: timing } = await svc
      .from('class_sessions')
      .select('session_date, start_time, course_type_id')
      .eq('id', booking.class_session_id)
      .single()
    if (timing && minutesUntil(timing.session_date, timing.start_time, getTodayLA(), getNowMinutesLA()) < 24 * 60) {
      const { data: ct } = await svc
        .from('course_types').select('slug').eq('id', timing.course_type_id).single()
      if (ct?.slug === '1on2' || booking.partner_booking_id) {
        return { ok: false, status: 400, error: '1-on-2 lessons starting within 24 hours cannot be cancelled online. Please contact us.', cancelledBookingIds: [] }
      }
      if (!booking.lesson_credit_id) {
        return { ok: false, status: 400, error: 'This lesson starts within 24 hours and cannot be cancelled online. Please contact us.', cancelledBookingIds: [] }
      }
      const quota = await getCancellationQuota(svc, booking.parent_id)
      if (quota.remaining <= 0) {
        return { ok: false, status: 400, error: 'This lesson starts within 24 hours and cannot be cancelled online. Please contact us.', cancelledBookingIds: [] }
      }
      convertToToken = true
      convertCourseTypeId = timing.course_type_id
    }
  }

  // Idempotent claim on the primary booking
  const { data: claimed } = await svc
    .from('bookings')
    .update({ status: 'cancelled', pending_action: null, cancellation_reason: 'cancelled_by_parent', cancelled_by: 'parent', cancelled_at: new Date().toISOString() })
    .eq('id', bookingId)
    .neq('status', 'cancelled')
    .select('id')
  if (!claimed || claimed.length === 0) {
    return { ok: false, status: 409, error: 'Already cancelled', cancelledBookingIds: [] }
  }

  const cancelledBookingIds: string[] = [booking.id]
  const cancelledPartners: { parent_id: string; student_id: string }[] = []

  if (booking.lesson_credit_id) {
    if (convertToToken && convertCourseTypeId) {
      const { error: tokenErr } = await svc.from('token_packages').insert({
        parent_id: booking.parent_id,
        course_type_id: convertCourseTypeId,
        total_tokens: 1,
        source: 'cancellation',
        source_booking_id: booking.id,
        expires_at: tokenExpiryFromNow(),
        note: 'Late cancellation conversion',
      })
      if (tokenErr) {
        // Never leave the parent short: fall back to a plain credit refund.
        await svc.rpc('decrement_used_credits', { credit_id: booking.lesson_credit_id })
        convertToToken = false
      }
    } else {
      await svc.rpc('decrement_used_credits', { credit_id: booking.lesson_credit_id })
    }
  }

  // Same-account 1-on-2 ONLY: cancel sibling bookings on the same session.
  // Other course types (1-on-4 etc.): each booking is independent — no sibling cascade.
  let sameParentBookings: any[] = []
  const { data: primarySession } = await svc
    .from('class_sessions')
    .select('course_types(slug)')
    .eq('id', booking.class_session_id)
    .single()
  const primaryCt = Array.isArray((primarySession as any)?.course_types) ? (primarySession as any).course_types[0] : (primarySession as any)?.course_types
  if (primaryCt?.slug === '1on2') {
    const { data: spb } = await svc
      .from('bookings')
      .select('id, lesson_credit_id, class_session_id')
      .eq('parent_id', booking.parent_id)
      .eq('class_session_id', booking.class_session_id)
      .neq('id', bookingId)
      .neq('status', 'cancelled')
      .neq('status', 'pending_payment')
      .neq('status', 'in_cart')
    sameParentBookings = spb || []
  }

  for (const pb of sameParentBookings || []) {
    const { data: c } = await svc
      .from('bookings')
      .update({ status: 'cancelled', pending_action: null, cancellation_reason: 'cancelled_by_parent', cancelled_by: 'parent', cancelled_at: new Date().toISOString() })
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
    .neq('status', 'in_cart')

      for (const pb of partnerBookings || []) {
        const { data: c } = await svc
          .from('bookings')
          .update({ status: 'cancelled', pending_action: null, cancellation_reason: 'cancelled_by_parent', cancelled_by: 'parent', cancelled_at: new Date().toISOString() })
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
      const targets: { parent_id: string; student_id: string; kind: 'credit' | 'token_conversion' | 'none' }[] = [
        { parent_id: booking.parent_id, student_id: booking.student_id, kind: booking.lesson_credit_id ? (convertToToken ? 'token_conversion' : 'credit') : 'none' },
        ...cancelledPartners.map((p) => ({ ...p, kind: 'credit' as const })),
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
            refundKind: t.kind,
          })
        }
      }
    }
  } catch {}

  return { ok: true, status: 200, cancelledBookingIds, convertedToToken: convertToToken }
}
