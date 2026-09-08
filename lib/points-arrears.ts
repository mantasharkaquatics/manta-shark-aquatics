// What happens after a payment we already credited turns out not to have been
// paid: a bank return, or a dispute raised with the customer's bank.
//
// Taking the points back is lib/points-wallet's job. This file is the part
// after that -- the family's balance is negative, and lessons they have not
// swum yet are sitting on coaches' calendars, paid for with money that never
// arrived. Releasing those lessons is both the fair thing (they get the points
// back, which pays down the debt) and the effective thing: the pressure to
// settle is that next week's lesson is gone, not a letter.
//
// Deliberately not automatic beyond this. A family two lessons into a package
// still owes those two lessons; that remainder stays as a negative balance for
// a human to chase.

import { applyPoints, arrears, getWallet } from '@/lib/points-wallet'

type Svc = any

export type ReclaimResult = {
  /** Points owed before anything was released. */
  arrearsBefore: number
  /** Points owed after -- zero if the released lessons covered the debt. */
  arrearsAfter: number
  cancelledBookingIds: string[]
  pointsReturned: number
}

/** Today in the school's timezone, as YYYY-MM-DD. Lessons are dated, not timestamped. */
function todayLA(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * Release the family's unswum lessons and put their points back, up to the
 * amount owed. Soonest lessons are kept and the furthest-out ones released
 * first, so a family who settles quickly loses as little of next week as
 * possible.
 *
 * Never touches a lesson that has already been checked in: the coach was
 * there, so it was delivered whatever happened to the payment.
 */
export async function reclaimForArrears(
  svc: Svc,
  parentId: string,
  note: string,
): Promise<ReclaimResult> {
  const wallet = await getWallet(svc, parentId)
  const owedAtStart = arrears(wallet)
  const empty: ReclaimResult = {
    arrearsBefore: owedAtStart, arrearsAfter: owedAtStart,
    cancelledBookingIds: [], pointsReturned: 0,
  }
  if (owedAtStart === 0) return empty

  const { data: bookings } = await svc
    .from('bookings')
    .select('id, class_session_id, points_charged, points_refunded, status')
    .eq('parent_id', parentId)
    .eq('status', 'confirmed')
    .not('points_charged', 'is', null)
  if (!bookings || bookings.length === 0) return empty

  // Two steps rather than a nested join: nested joins have been unreliable in
  // production here, and this one decides whether a lesson gets cancelled.
  const sessionIds = [...new Set(bookings.map((b: any) => b.class_session_id).filter(Boolean))]
  const { data: sessions } = await svc
    .from('class_sessions')
    .select('id, session_date, start_time')
    .in('id', sessionIds)
    .gte('session_date', todayLA())
  const futureById = new Map((sessions || []).map((s: any) => [s.id, s]))

  const { data: attended } = await svc
    .from('attendance')
    .select('booking_id')
    .in('booking_id', bookings.map((b: any) => b.id))
  const checkedIn = new Set((attended || []).map((a: any) => a.booking_id))

  const releasable = bookings
    .filter((b: any) => futureById.has(b.class_session_id) && !checkedIn.has(b.id))
    .map((b: any) => ({ ...b, sess: futureById.get(b.class_session_id) }))
    .sort((a: any, b: any) =>
      String(b.sess.session_date).localeCompare(String(a.sess.session_date)) ||
      String(b.sess.start_time).localeCompare(String(a.sess.start_time)))

  const cancelledBookingIds: string[] = []
  let pointsReturned = 0
  let owed = owedAtStart

  for (const b of releasable) {
    if (owed <= 0) break
    const back = (b.points_charged ?? 0) - (b.points_refunded ?? 0)
    if (back <= 0) continue

    // Claim the booking first, exactly as the school-cancel path does: only
    // the request that flips confirmed -> cancelled is allowed to give the
    // points back, so a parent cancelling the same lesson in the same second
    // cannot make it refund twice.
    const { data: claimed } = await svc
      .from('bookings')
      .update({
        status: 'cancelled',
        pending_action: null,
        cancellation_reason: 'cancelled_by_school',
        cancelled_by: 'system',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', b.id)
      .eq('status', 'confirmed')
      .select('id')
    if (!claimed || claimed.length === 0) continue

    try {
      await applyPoints(svc, {
        parentId,
        reason: 'school_cancel',
        points: back,
        bookingId: b.id,
        actor: 'system',
        note,
      })
    } catch (e) {
      // The points did not go back, so the lesson must not stay cancelled --
      // otherwise the family loses both. Put it back and stop: something is
      // wrong with the wallet and the next booking would hit it too.
      await svc.from('bookings')
        .update({ status: 'confirmed', cancellation_reason: null, cancelled_by: null, cancelled_at: null })
        .eq('id', b.id).eq('status', 'cancelled')
      console.error(`reclaimForArrears: could not return ${back} points for booking ${b.id}:`, e)
      break
    }

    // Only now, and only with what actually moved. Stamping this before the
    // refund lands is how a lesson ends up marked refunded but never repaid.
    await svc.from('bookings')
      .update({ points_refunded: (b.points_refunded ?? 0) + back })
      .eq('id', b.id)

    cancelledBookingIds.push(b.id)
    pointsReturned += back
    owed -= back
  }

  const after = await getWallet(svc, parentId)
  return {
    arrearsBefore: owedAtStart,
    arrearsAfter: arrears(after),
    cancelledBookingIds,
    pointsReturned,
  }
}
