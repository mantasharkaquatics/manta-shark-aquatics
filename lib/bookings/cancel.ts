import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { formatTime12h, getTodayLA, getNowMinutesLA, minutesUntil } from '@/lib/date'
import { refundBookingPoints } from '@/lib/bookings/refund'
import { graceUsedThisMonth, issueVoucher, restoreVoucher, voucherWindow, type Voucher } from '@/lib/vouchers'

export type CancelTarget = {
  parent_id: string
  student_id: string
  // points: refunded. voucher: turned into a make-up voucher. none: kept.
  // assessment: a paid Swim Assessment the school cancelled -- the payment is
  // kept and the desk books a new time (owner, 2026-10-06).
  kind: 'points' | 'voucher' | 'none' | 'assessment'
  voucherExpires?: string
  /** A leave voucher's first usable date (it covers the 14 days either side). */
  voucherFrom?: string | null
  /** The voucher that paid for a make-up came BACK; no new one was made. */
  voucherBack?: boolean
}

/**
 * What a parent's cancellation does to the lesson (docs/fixed-class-spec.md):
 *   refund    a single lesson, 24 hours or more ahead: the points come back
 *   voucher   a fixed-class lesson 24 hours or more ahead (leave), or any
 *             lesson inside 24 hours on the child's grace of the month
 *   restore   a make-up lesson 24 hours or more ahead: its voucher comes back
 *   keep      a make-up lesson inside 24 hours: the voucher is spent
 * Admin and system callers always refund.
 */
export type CancelOutcome = 'refund' | 'voucher' | 'restore' | 'keep'

export type CancelResult = {
  ok: boolean
  status: number
  error?: string
  cancelledBookingIds: string[]
  pointsRefunded?: number
  outcome?: CancelOutcome
  voucher?: Voucher | null
  // Who should be told, and what they got back. The caller keeps these when it
  // is cancelling a 60-minute lesson half by half, so one email can cover the
  // whole hour instead of one per half.
  emailTargets?: CancelTarget[]
}

export type CancelOptions = {
  // Suppress this call's own email. Used when a caller is cancelling several
  // linked bookings and will send a single consolidated message itself.
  skipEmail?: boolean
  // How the first half of this lesson was settled. A 60-minute lesson is two
  // 30-minute bookings cancelled half by half; the second half must follow the
  // first -- refunded if it was, and NOT given a voucher (or a second grace)
  // of its own when the first half already turned the hour into one.
  settled?: CancelOutcome
}

// Sends one booking_cancelled email per affected parent. The time range spans
// from the earliest cancelled session's start to the latest one's end, so a
// 60-minute lesson reads "9:10 AM – 10:10 AM" rather than one message per half.
// Best effort: never throws, never blocks the cancellation itself.
export async function notifyCancellation(
  svc: SupabaseClient,
  opts: { bookingIds: string[]; targets: CancelTarget[] }
): Promise<void> {
  try {
    if (!opts.bookingIds?.length || !opts.targets?.length) return

    const { data: rows } = await svc
      .from('bookings')
      .select('class_session_id')
      .in('id', opts.bookingIds)
    const sessionIds = [...new Set((rows || []).map((r: any) => r.class_session_id).filter(Boolean))]
    if (!sessionIds.length) return

    const { data: sessions } = await svc
      .from('class_sessions')
      .select('id, session_date, start_time, end_time, course_type_id, coach_id')
      .in('id', sessionIds)
      .order('start_time', { ascending: true })
    if (!sessions?.length) return

    const first = sessions[0] as any
    const last = sessions[sessions.length - 1] as any

    const { data: ct } = await svc.from('course_types').select('name').eq('id', first.course_type_id).single()
    const { data: coach } = await svc.from('coaches').select('first_name, last_name').eq('id', first.coach_id).single()
    const coachName = coach ? (coach.first_name + ' ' + (coach.last_name || '')).trim() : ''
    const timeStr = formatTime12h(first.start_time) + ' \u2013 ' + formatTime12h(last.end_time)

    const studentIds = [...new Set(opts.targets.map((t) => t.student_id).filter(Boolean))]
    const { data: studs } = await svc.from('students').select('id, full_name').in('id', studentIds)
    const nameOf: Record<string, string> = {}
    for (const s of studs || []) { nameOf[(s as any).id] = (s as any).full_name }

    // One message per parent, naming every swimmer of theirs in the lesson.
    const byParent = new Map<string, { names: string[]; kind: CancelTarget['kind']; expires?: string; from?: string | null; back?: boolean }>()
    for (const t of opts.targets) {
      if (!t.parent_id) continue
      const entry = byParent.get(t.parent_id) || { names: [], kind: t.kind, expires: t.voucherExpires, from: t.voucherFrom, back: t.voucherBack }
      const n = nameOf[t.student_id]
      if (n && !entry.names.includes(n)) entry.names.push(n)
      // A real refund anywhere in the group outranks 'none'.
      if (entry.kind === 'none' && t.kind !== 'none') entry.kind = t.kind
      byParent.set(t.parent_id, entry)
    }

    for (const [parentId, entry] of byParent) {
      const { data: p } = await svc.from('parents').select('first_name, email').eq('id', parentId).single()
      if (!p?.email) continue
      await sendEmail({
        type: 'booking_cancelled',
        to: p.email,
        parentName: p.first_name,
        studentName: entry.names.join(' & '),
        courseName: ct?.name || '',
        coachName,
        date: first.session_date,
        time: timeStr,
        refundKind: entry.kind,
        expiresOn: entry.expires,
        usableFrom: entry.from ?? undefined,
        voucherBack: entry.back,
      })
    }
  } catch {}
}

/**
 * Cancel a whole lesson, however many booking rows it is made of.
 *
 * A 60-minute lesson is two 30-minute bookings linked by lesson_group_id.
 * cancelBookingWithPartner below cancels ONE of them (plus its 1-on-2
 * partners); it has no idea the other half exists. Both callers that cancel on
 * a parent's behalf need the hour, so the sweep lives here rather than in one
 * of them -- the chat assistant used to call the half-cancel directly and tell
 * the family their lesson was gone while a coach still had thirty minutes
 * booked and half the points were still spent.
 *
 * The lesson is settled once (refund, or one 60-minute voucher), not per half.
 *
 * `remainingBookingIds` is non-empty only when part of an hour survived, which
 * the spec forbids: nothing is un-cancelled, the halves that went are
 * refunded, and staff finish the rest by hand.
 */
export async function cancelLesson(
  svc: SupabaseClient,
  bookingId: string,
  callerParentId: string | null,
  options: { skipEmail?: boolean } = {},
): Promise<CancelResult & { remainingBookingIds?: string[] }> {
  const { data: self } = await svc
    .from('bookings').select('lesson_group_id, parent_id').eq('id', bookingId).single()
  const groupId: string | null = self?.lesson_group_id || null

  // A 60-minute lesson is judged by when it STARTS. The half named decides
  // the outcome and the other follows it, so naming the second half (the AI's
  // list shows both, an API call can name either) judged the 24-hour line
  // from thirty minutes later -- a refund for a lesson starting in under 24
  // hours (found 2026-10-03). Start from this family's earliest live half.
  if (groupId) {
    const { data: halves } = await svc.from('bookings')
      .select('id, parent_id, status, class_session_id')
      .eq('lesson_group_id', groupId).not('status', 'in', '("cancelled")')
    const mine = (halves || []).filter((h: any) => h.parent_id === self?.parent_id)
    if (mine.length > 1) {
      const { data: ss } = await svc.from('class_sessions').select('id, session_date, start_time')
        .in('id', mine.map((h: any) => h.class_session_id))
      const at = new Map((ss || []).map((x: any) => [x.id, `${x.session_date} ${String(x.start_time).slice(0, 5)}`]))
      const first = [...mine].sort((a: any, b: any) => String(at.get(a.class_session_id)).localeCompare(String(at.get(b.class_session_id))))[0]
      if (first?.id) bookingId = first.id
    }
  }

  const result = await cancelBookingWithPartner(svc, bookingId, callerParentId, {
    skipEmail: options.skipEmail || !!groupId,
  })
  if (!result.ok || !groupId) return result

  const cancelled = [...(result.cancelledBookingIds || [])]
  const targets: CancelTarget[] = [...(result.emailTargets || [])]
  let pointsBack = result.pointsRefunded ?? 0
  // The other half follows the first: same refund, no second voucher or grace.
  const settled = result.outcome

  const { data: siblings } = await svc
    .from('bookings').select('id')
    .eq('lesson_group_id', groupId)
    .not('status', 'in', '("cancelled")')

  for (const sib of siblings || []) {
    if (cancelled.includes(sib.id)) continue
    const r = await cancelBookingWithPartner(svc, sib.id, callerParentId, {
      skipEmail: true,
      settled,
    })
    if (r.ok) {
      cancelled.push(...(r.cancelledBookingIds || [sib.id]))
      targets.push(...(r.emailTargets || []))
      pointsBack += r.pointsRefunded ?? 0
    }
    // A 403 here is expected and harmless: rows belonging to the other family
    // are not ours to cancel directly, and the cross-account sweep inside their
    // own half picks them up. Any other failure is caught by the check below.
  }

  // Trust the database, not the loop.
  const { data: leftover } = await svc
    .from('bookings').select('id')
    .eq('lesson_group_id', groupId)
    .not('status', 'in', '("cancelled")')

  if (leftover && leftover.length > 0) {
    return {
      ok: false,
      status: 409,
      error: 'Part of this 60-minute lesson could not be cancelled. Please contact us so we can finish it.',
      cancelledBookingIds: cancelled,
      remainingBookingIds: leftover.map((r: any) => r.id),
      emailTargets: targets,
    }
  }

  // One email per family, spanning the full hour.
  if (!options.skipEmail) await notifyCancellation(svc, { bookingIds: cancelled, targets })

  return { ...result, ok: true, status: 200, cancelledBookingIds: cancelled, emailTargets: targets, pointsRefunded: pointsBack }
}

// Cancels one booking plus any same-account and cross-account partner bookings
// in the same time slot, refunds credits via atomic RPCs, and emails all
// affected parents. Idempotent: every status flip is a conditional update, so
// concurrent duplicate calls cannot double-refund.
export async function cancelBookingWithPartner(
  svc: SupabaseClient,
  bookingId: string,
  callerParentId: string | null,
  options: CancelOptions = {}
): Promise<CancelResult> {
  const { data: booking } = await svc
    .from('bookings')
    .select('id, class_session_id, points_charged, points_refunded, partner_booking_id, parent_id, student_id, status, is_trial, fixed_class_id, voucher_id, lesson_group_id')
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

  // A Swim Assessment is a one-off sold at its own price, not a lesson drawn
  // from a package. Refunding it as a lesson credit or converting it to a
  // make-up token would hand back something worth more, or less, than what was
  // paid. The family tells us and the front desk cancels it by hand, which is
  // why this only blocks the parent -- an admin or system caller still can.
  if (callerParentId && booking.is_trial) {
    return { ok: false, status: 400, error: "A Swim Assessment can't be cancelled online. Please contact us and we'll take care of it.", cancelledBookingIds: [] }
  }

  // A parent can only cancel a lesson that is still ahead of them (found
  // 2026-10-05). Before this, a lesson already under way or over -- or one
  // whose row had moved past 'confirmed' -- could be cancelled for a grace
  // voucher. 'pending_partner' (an invitation, nothing charged) is allowed
  // through; 'cancelled' falls through to the "Already cancelled" claim below.
  // The start-time half of this check is with the timing read further down.
  const LESSON_STARTED_ERROR = 'This lesson has already started, so it can no longer be cancelled.'
  if (callerParentId && !['confirmed', 'pending_partner', 'cancelled'].includes(booking.status)) {
    return { ok: false, status: 400, error: LESSON_STARTED_ERROR, cancelledBookingIds: [] }
  }

  // What the cancellation does (CancelOutcome above). Admin and system
  // callers always refund; only a parent's own cancellation is judged by the
  // clock, the kind of lesson, and the child's grace of the month.
  let outcome: CancelOutcome = 'refund'
  let voucherReason: 'leave' | 'grace' = 'leave'
  let sessionDate = ''
  let ctSlug = ''
  if (callerParentId) {
    const { data: timing } = await svc
      .from('class_sessions')
      .select('session_date, start_time, course_type_id')
      .eq('id', booking.class_session_id)
      .single()
    const { data: ct } = timing
      ? await svc.from('course_types').select('slug').eq('id', timing.course_type_id).single()
      : { data: null as any }
    sessionDate = timing?.session_date || getTodayLA()
    ctSlug = ct?.slug || ''
    const untilStart = timing ? minutesUntil(timing.session_date, timing.start_time, getTodayLA(), getNowMinutesLA()) : null
    if (untilStart !== null && untilStart <= 0) {
      return { ok: false, status: 400, error: LESSON_STARTED_ERROR, cancelledBookingIds: [] }
    }
    const late = untilStart === null || untilStart < 24 * 60
    if (options.settled) {
      // The second half of an hour follows the first, whatever it was.
      outcome = options.settled
    } else if (booking.status === 'pending_partner') {
      // An invitation the other family has not accepted yet (found
      // 2026-10-05). Nothing has been charged -- both families pay when the
      // invitation is confirmed -- so withdrawing it costs nothing and spends
      // no grace, whatever the clock says. The inviter's row carries
      // partner_booking_id, which used to send this into the "1-on-2 within
      // 24 hours" refusal below and left the inviter unable to withdraw.
      outcome = 'refund'
    } else if (booking.voucher_id) {
      // A make-up lesson: in time, the voucher comes back; inside 24 hours it
      // is spent. Never a grace -- a make-up is already the second chance.
      outcome = late ? 'keep' : 'restore'
    } else if (late) {
      // A cross-family 1-on-2 inside 24 hours stays with the front desk: a
      // second family shares the slot, and theirs is not ours to settle.
      if (booking.partner_booking_id) {
        return { ok: false, status: 400, error: '1-on-2 lessons starting within 24 hours cannot be cancelled online. Please contact us.', cancelledBookingIds: [] }
      }
      // A sibling 1-on-2 spends BOTH children's grace (owner, 2026-10-03):
      // both seats are given up, so either child having used theirs already
      // stops it. The voucher carries both children, and graceUsedThisMonth
      // counts its second child too.
      const kids = [booking.student_id]
      if (ctSlug === '1on2') {
        const { data: seat } = await svc.from('bookings').select('student_id')
          .eq('parent_id', booking.parent_id).eq('class_session_id', booking.class_session_id)
          .neq('id', booking.id).not('status', 'in', '("cancelled","pending_payment","in_cart")')
        for (const s of seat || []) if (s.student_id && !kids.includes(s.student_id)) kids.push(s.student_id)
      }
      const used = await graceUsedThisMonth(svc, kids)
      if (kids.some(k => used.has(k))) {
        // Nothing to spend, so the lesson cannot be cancelled online. The
        // dashboard says so before the parent gets here; this is the server
        // refusing to be talked past.
        return { ok: false, status: 400, error: 'NO_GRACE_LEFT', cancelledBookingIds: [] }
      }
      outcome = 'voucher'; voucherReason = 'grace'
    } else {
      // In time: a fixed-class lesson becomes a make-up voucher (the points
      // were for a term, not one date); a single lesson is refunded.
      outcome = booking.fixed_class_id ? 'voucher' : 'refund'
    }
  }
  const refundPoints = outcome === 'refund'

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
  // kind carries whether points actually reached that family's wallet, so a
  // refund that failed does not turn into an email saying it succeeded.
  const cancelledPartners: { parent_id: string; student_id: string; kind: 'points' | 'none' }[] = []

  // What actually went back, not what was due: the email below promises the
  // family their points, and it must not promise them on the strength of a
  // refund that failed.
  let refunded = refundPoints
    ? await refundBookingPoints(svc, {
        booking,
        parentId: booking.parent_id,
        reason: 'cancel_refund',
        actor: callerParentId ? 'parent' : 'system',
      })
    : 0
  if (outcome === 'restore' && booking.voucher_id) await restoreVoucher(svc, booking.voucher_id, booking.id)

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
      .select('id, student_id, status, points_charged, points_refunded, class_session_id')
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
    // The sibling seat of the same 1-on-2, paid in the same debit. It follows
    // the primary: refunded when the primary was, kept when it was not.
    // Counted into what this family got back: the AI assistant quotes it, and a
    // sibling 1-on-2 answered with half the refund (found 2026-10-03).
    if (refundPoints) {
      refunded += await refundBookingPoints(svc, {
        booking: pb,
        parentId: booking.parent_id,
        reason: 'cancel_refund',
        actor: callerParentId ? 'parent' : 'system',
      })
    }
  }

  // The make-up voucher, once per lesson: not for the second half of an hour
  // (the first half's voucher is already a 60-minute one), and one voucher for
  // a sibling 1-on-2 with both children on it. If the database refuses it --
  // the child's grace was spent by a cancellation that raced this one -- the
  // lesson is put back rather than lost with nothing to show for it.
  let voucher: Voucher | null = null
  let restoredExpiry: string | undefined
  let restoredFrom: string | null = null
  if (outcome === 'voucher' && !options.settled) {
    const sibling = sameParentBookings.find((x: any) => cancelledBookingIds.includes(x.id))
    const r = await issueVoucher(svc, {
      parentId: booking.parent_id,
      studentId: booking.student_id,
      student2Id: ctSlug === '1on2' ? sibling?.student_id ?? null : null,
      courseSlug: ctSlug,
      minutes: booking.lesson_group_id ? 60 : 30,
      reason: voucherReason,
      ...voucherWindow(voucherReason, sessionDate),
      sourceBookingId: booking.id,
      fixedClassId: booking.fixed_class_id ?? null,
    })
    if (!r.voucher) {
      await svc.from('bookings')
        .update({ status: booking.status, cancellation_reason: null, cancelled_by: null, cancelled_at: null })
        .in('id', cancelledBookingIds)
      return r.duplicate && voucherReason === 'grace'
        ? { ok: false, status: 400, error: 'NO_GRACE_LEFT', cancelledBookingIds: [] }
        : { ok: false, status: 500, error: 'Could not cancel this lesson. Please try again.', cancelledBookingIds: [] }
    }
    voucher = r.voucher
  } else if (outcome === 'restore' && booking.voucher_id) {
    const { data: v } = await svc.from('make_up_vouchers').select('expires_on, usable_from').eq('id', booking.voucher_id).maybeSingle()
    restoredExpiry = v?.expires_on
    restoredFrom = v?.usable_from ?? null
  }

  // Cross-account partner: bookings on any session with same date + time + coach.
  //
  // 1-on-2 ONLY. This block finds "the other family" by matching date + start_time
  // + coach_id, which is exactly right for a two-family 1-on-2 pairing but is NOT
  // a partnership test. A banded 1-on-4 group class is up to four UNRELATED
  // families sharing one class_session, all matching that heuristic — without this
  // gate, one parent cancelling would cancel and refund every other family in the
  // class and email them a cancellation notice. Owner's rule: cancelling a group
  // class cancels that family's booking and nothing else.
  if (primaryCt?.slug === '1on2') {
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
          .select('id, points_charged, points_refunded, class_session_id, parent_id, student_id')
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
          // The OTHER family cancelled and took this one down with it. They
          // did not choose this, so their points come back in full whatever
          // the clock says, and it costs them no grace -- this was never
          // their cancellation.
          const partnerBack = await refundBookingPoints(svc, {
            booking: pb,
            parentId: pb.parent_id,
            reason: 'school_cancel',
            actor: 'system',
            note: 'the other family cancelled this 1-on-2',
          })
          cancelledPartners.push({
            parent_id: pb.parent_id,
            student_id: pb.student_id,
            kind: partnerBack > 0 ? 'points' : 'none',
          })
        }
      }
    }
  }

  // Who to tell. Handed back to the caller so a 60-minute cancellation can send
  // one message covering both halves instead of one per half.
  const emailTargets: CancelTarget[] = [
    outcome === 'voucher' || outcome === 'restore'
      ? { parent_id: booking.parent_id, student_id: booking.student_id, kind: 'voucher' as const, voucherExpires: voucher?.expires_on || restoredExpiry, voucherFrom: voucher ? voucher.usable_from : restoredFrom, voucherBack: outcome === 'restore' }
      : { parent_id: booking.parent_id, student_id: booking.student_id, kind: refunded > 0 ? 'points' as const : 'none' as const },
    ...cancelledPartners,
  ]

  if (!options.skipEmail) {
    await notifyCancellation(svc, { bookingIds: cancelledBookingIds, targets: emailTargets })
  }

  return { ok: true, status: 200, cancelledBookingIds, pointsRefunded: refunded, outcome, voucher, emailTargets }
}
