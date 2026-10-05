import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { ledgerRefundedFor, refundBookingPoints } from '@/lib/bookings/refund'
import { refundLooksOwed, voucherCoveredIds, type RefundCheckRow } from '@/lib/admin/review-queues'
import { readJson, badRequest } from '@/lib/http'

export const runtime = 'nodejs'

// The "Retry refund" button on /admin/reviews ("退點未完成", owner 2026-10-04).
//
// refundBookingPoints never throws: when the wallet write fails, the lesson
// stays cancelled with points_charged - points_refunded > 0 and nothing comes
// back for it. This gives the desk a way to send those points again.
//
// Points are money, so before moving any it makes sure of three things:
//   1. the booking still qualifies, by the same rules the queue uses
//      (lib/admin/review-queues.ts) -- 409 otherwise;
//   2. only one request is acting on it (a lease on updated_at, below);
//   3. the points have not in fact already gone back. The ledger is the record
//      of what moved; points_refunded is written after it and can lag. When
//      the ledger already covers the gap, only the stamp is corrected.
const LEASE_MS = 60_000
const COLS = 'id, parent_id, status, points_charged, points_refunded, cancelled_by, cancellation_reason, class_session_id, lesson_group_id, updated_at, cancelled_at'

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return badRequest()
  const bookingId = String(body.booking_id || '')
  if (!bookingId) return NextResponse.json({ error: 'Missing booking_id' }, { status: 400 })
  const svc = auth.svc

  const { data: b, error: readErr } = await svc.from('bookings').select(COLS).eq('id', bookingId).maybeSingle()
  if (readErr) return NextResponse.json({ error: 'Could not read this booking. Please try again.' }, { status: 500 })
  if (!b) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!b.parent_id) return NextResponse.json({ error: 'This booking has no family to refund.' }, { status: 409 })

  const stale = () => NextResponse.json({ error: 'This lesson no longer needs a refund. Refresh the page.' }, { status: 409 })
  if (!refundLooksOwed(b as RefundCheckRow)) return stale()
  try {
    if ((await voucherCoveredIds(svc, [b as RefundCheckRow])).has(b.id)) return stale()
  } catch (e) {
    console.error(`refund-retry ${bookingId}: voucher check failed:`, e)
    return NextResponse.json({ error: 'Could not check this booking. Please try again.' }, { status: 500 })
  }

  // The claim: a short lease on the row, held through updated_at. Two presses
  // at once (a double click, two admins, two tabs) would otherwise both read
  // the same figures and both refund -- the stamp guard in refundBookingPoints
  // only notices AFTER the second refund has landed, and the ledger check
  // below cannot see a refund that is still in flight.
  //   - The conditional update lets one of two requests that read the same
  //     row through; Postgres re-checks the WHERE after the first commits.
  //   - A request that reads the row AFTER someone's claim sees a fresh
  //     updated_at and stands down until the lease has run out. A whole
  //     attempt (four wallet tries at most) finishes well inside it.
  // updated_at is the row's last-touched time (the schedule's "recent
  // cancellations" list reads it). Nothing in the app writes it, so the
  // database keeps it, and the refund's own stamp would move it anyway.
  const busy = () => NextResponse.json(
    { error: 'A refund for this lesson was tried moments ago. Wait a minute and try again.', busy: true }, { status: 409 })
  const prev: string | null = b.updated_at ?? null
  const prevMs = prev ? Date.parse(prev) : NaN
  if (Number.isFinite(prevMs) && Date.now() - prevMs < LEASE_MS) return busy()
  const claimQ = svc.from('bookings').update({ updated_at: new Date().toISOString() }).eq('id', b.id)
  const { data: claimed, error: claimErr } = await (prev === null ? claimQ.is('updated_at', null) : claimQ.eq('updated_at', prev)).select('id')
  if (claimErr) return NextResponse.json({ error: 'Could not start the refund. Please try again.' }, { status: 500 })
  if (!claimed || claimed.length === 0) return busy()

  const charged = Number(b.points_charged) || 0
  let stamped = Number(b.points_refunded) || 0

  // What the ledger says already went back for this booking.
  let ledger: number
  try {
    ledger = await ledgerRefundedFor(svc, b.id)
  } catch (e) {
    console.error(`refund-retry ${bookingId}:`, e)
    return NextResponse.json({ error: 'Could not check the points history. Please try again.' }, { status: 500 })
  }

  if (ledger > stamped) {
    // Points moved that the stamp never recorded. Bring the stamp up to what
    // actually moved (never past what was charged), guarded on the old value.
    const fixed = Math.min(ledger, charged)
    if (ledger > charged) {
      console.error(`⚠️ refund-retry: booking ${b.id} has ${ledger} points refunded in the ledger against ${charged} charged. Check for a double refund.`)
    }
    const fixQ = svc.from('bookings').update({ points_refunded: fixed }).eq('id', b.id)
    const { data: ok } = await (b.points_refunded == null ? fixQ.is('points_refunded', null) : fixQ.eq('points_refunded', b.points_refunded))
      .select('id')
    if (!ok || ok.length === 0)
      return NextResponse.json({ error: 'This booking changed while you were looking at it. Refresh and try again.' }, { status: 409 })
    if (fixed >= charged) return NextResponse.json({ ok: true, fixedStamp: true })
    stamped = fixed
  }

  const refunded = await refundBookingPoints(svc, {
    booking: { id: b.id, points_charged: charged, points_refunded: stamped },
    parentId: b.parent_id,
    reason: 'cancel_refund',
    actor: `admin:${auth.admin.id}`,
    note: 'Refund retried by the desk',
  })
  if (refunded <= 0) return NextResponse.json({ error: 'The refund failed again. Please try later.' }, { status: 500 })
  return NextResponse.json({ ok: refunded > 0, refunded })
}
