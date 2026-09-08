// Giving a cancelled lesson's points back, and recording that we did.
//
// One function because the ordering is the whole point and it was wrong in
// five places. The shape that kept appearing was:
//
//   applyPoints(...).catch(e => console.error(e))
//   await svc.from('bookings').update({ points_refunded: b.points_charged })
//
// which stamps the lesson as refunded whether or not the points moved. When
// the wallet write failed -- contention, a ledger outage, anything -- the
// family lost the lesson AND the points, and the row then said the refund had
// happened, so no later pass would ever put it right. The booking's own
// arithmetic (points_charged - points_refunded) is the only record of what is
// still owed, and it has to stay true.
//
// So: the stamp happens only after the points land, and it is guarded so two
// paths refunding the same lesson cannot both write it.

import { applyPoints, type LedgerReason } from '@/lib/points-wallet'

type Svc = any

export type RefundableBooking = {
  id: string
  points_charged?: number | null
  points_refunded?: number | null
}

/**
 * Returns the points that actually reached the wallet: 0 when nothing was
 * owed, and 0 when the refund failed. Callers use the figure to decide what
 * to tell the family -- an email saying "your points are back" must not go
 * out on the strength of a refund that did not happen.
 *
 * Never throws. A cancellation has usually already been committed by the time
 * this is called, and unwinding it is the caller's decision, not this one's.
 */
export async function refundBookingPoints(
  svc: Svc,
  args: {
    booking: RefundableBooking
    parentId: string
    reason: LedgerReason
    actor: string
    note?: string | null
    /** cancel.ts only: a late cancellation that burns one allowance. */
    consumeForgiveness?: boolean
  },
): Promise<number> {
  const already = args.booking.points_refunded ?? 0
  const owed = (args.booking.points_charged ?? 0) - already
  if (owed <= 0) return 0

  try {
    await applyPoints(svc, {
      parentId: args.parentId,
      reason: args.reason,
      points: owed,
      bookingId: args.booking.id,
      actor: args.actor,
      note: args.note ?? null,
      consumeForgiveness: args.consumeForgiveness,
    })
  } catch (e) {
    // Loud, and the row is left saying the points are still owed -- which is
    // what makes this recoverable by running the same path again.
    console.error(
      `⚠️ REFUND FAILED booking=${args.booking.id} parent=${args.parentId} ` +
      `points=${owed} reason=${args.reason}:`, e
    )
    return 0
  }

  const { data: stamped } = await svc
    .from('bookings')
    .update({ points_refunded: already + owed })
    .eq('id', args.booking.id)
    .eq('points_refunded', already)
    .select('id')
  if (!stamped || stamped.length === 0) {
    console.error(
      `⚠️ booking ${args.booking.id}: ${owed} points were returned but points_refunded ` +
      `moved underneath the stamp (expected ${already}). Check for a double refund.`
    )
  }
  return owed
}
