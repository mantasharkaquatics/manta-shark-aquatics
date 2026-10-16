import { allRows, allRowsIn } from '@/lib/db-paging'
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getTodayLA } from '@/lib/date'
import { DEFAULT_LOCATION_ID, getLocations, showLocations } from '@/lib/locations'
import { reversedCentsByPurchase } from '@/lib/points-wallet'

export const runtime = 'nodejs'

/* THE ACCOUNTANT'S NUMBERS.
 *
 * Money a family puts in is NOT revenue. It is cash plus a liability, and it
 * becomes revenue only when a lesson is actually taught. That liability has two
 * halves, and counting only the first is the mistake this route exists to
 * prevent:
 *
 *   1. points still sitting in the wallet, and
 *   2. points already deducted for lessons that have not happened yet.
 *
 * A lesson booked in September for November has left the wallet but is still
 * owed. Revenue is recognised on the session DATE, no-shows included -- a
 * no-show consumes the lesson and the points are not returned, so it is earned.
 *
 * MAKE-UP VOUCHERS (docs/fixed-class-spec.md section 7). A lesson turned into a
 * voucher keeps its points, but nothing has been taught yet: the family is
 * still owed a lesson. So its points stay DEFERRED while the voucher is active,
 * and become revenue when the voucher ends -- on the make-up lesson's date if
 * it is used, on the expiry date if it runs out, on the day the desk voids it
 * (owner, 2026-10-01). The make-up booking itself carries no points.
 *
 * GRANTED points are deliberately outside the liability. They were never cash,
 * so there is no revenue to defer; they are a discount, and they can never be
 * refunded for money. Reported separately so nobody wonders where they went.
 *
 * This is an ACCRUAL view -- that is what "deferred revenue" means. The cash
 * columns are here for the opposite reason: if the business files on a cash
 * basis, those are the figures that matter and the accrual ones are context. */

const MONTHS_BACK = 13

type Row = { created_at: string; delta_purchased: number; delta_granted: number; reason: string; amount_cents: number | null; pricing: { kind?: string } | null }

/** 'YYYY-MM' in LA. Month boundaries are a local-calendar question and the
 *  server is UTC in production, so a December 31st evening top-up must not land
 *  in January. */
/** 'YYYY-MM-DD' in LA, for a timestamp. */
function monthDayLA(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso))
}

function monthKeyLA(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit',
  }).format(new Date(iso)).slice(0, 7)
}

// Ledger reasons that move purchased points without being a lesson taken or
// given back: money in or out, reversals, and hand adjustments by staff.
// refund_failed is the points of a refund that never reached the family going
// back; counted as lessons, it lowered "Points used" by the failed amount
// (found 2026-10-15).
const NOT_LESSON_TRAFFIC = new Set([
  'purchase', 'cash_refund', 'refund_failed', 'payment_failed', 'chargeback',
  'admin_grant', 'admin_deduct', 'referral_bonus', 'grant_expired', 'birthday_gift',
])

// allRows: lib/db-paging.ts. A report that silently stopped at the first
// thousand bookings would understate the liability without saying so.

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = auth.svc

  const today = getTodayLA()
  const since = new Date(Date.now() - MONTHS_BACK * 31 * 86_400_000).toISOString()

  // A read that failed part-way comes back with what it had, and every figure
  // built from it is low with nothing on screen saying so -- what the note on
  // allRows above says must not happen (found 2026-10-15: only the fee read
  // kept its error). Each failed read is named in `incomplete`, which the
  // page shows above the figures.
  const failedReads: string[] = []
  const readFailed = (what: string, error: { message?: string } | null | undefined) => {
    if (!error) return
    console.error(`finance: ${what} not read:`, error.message || error)
    failedReads.push(what)
  }

  const [{ data: wallets, error: walletsErr }, { data: ledger, error: ledgerErr }, { data: bookings, error: bookingsErr }, { data: purchases, error: purchasesErr }, { data: vouchers, error: vouchersErr }] = await Promise.all([
    allRows(() => svc.from('point_wallets').select('balance_purchased, balance_granted, total_paid_cents, total_refunded_cents').order('parent_id')),
    allRows(() => svc.from('point_ledger')
      .select('created_at, delta_purchased, delta_granted, reason, amount_cents, pricing')
      .gte('created_at', since)
      .order('created_at', { ascending: true }).order('id', { ascending: true })),
    // Everything that carries points. Deliberately NOT an
    // allow-list of statuses: a liability report must over-include rather than
    // miss an obligation, and a status added later (or one this file's author
    // did not know about) would silently drop points out of the total. The
    // points_charged filter is what makes it safe -- a row with no points
    // against it is nothing owed.
    // Cancelled rows come too, for ONE case: a late cancellation the desk
    // makes without a refund (admin cancel-booking, refund:false) keeps the
    // points, and those are earned exactly like a no-show's. That route marks
    // it cancelled_by 'admin' + cancellation_reason 'cancelled_by_parent'.
    // Every other cancelled row must stay out: a rescheduled lesson's old row
    // is cancelled with its points unrefunded ON PURPOSE -- they moved to the
    // new row -- and counting it booked the same lesson twice.
    allRows(() => svc.from('bookings')
      .select('id, points_charged, points_refunded, points_granted, status, cancelled_by, cancellation_reason, class_session_id, student_id, lesson_group_id')
      .not('points_charged', 'is', null).order('id')),
    // What Stripe kept. Read from the payments themselves rather than derived
    // from a rate: ACH is capped, cards carry extras, Terminal differs again.
    // A payment with no fee recorded is either cash at the desk or a bank debit
    // that has not settled -- counted separately so the total is never quietly
    // understated.
    // Reversed ones too: a dispute can be for part of a payment, and the part
    // the bank left is still cash in (found 2026-10-15). See below.
    allRows(() => svc.from('purchases')
      .select('id, amount_cents, fee_cents, net_cents, fee_captured_at, paid_at, reversed_at, stripe_payment_intent_id, stripe_session_id')
      .eq('status', 'paid')
      .gte('paid_at', since).order('id')),
    // Vouchers that replaced a lesson someone paid for. One issued by hand
    // (no source lesson) defers nothing: no points were taken for it.
    allRows(() => svc.from('make_up_vouchers')
      .select('id, status, source_booking_id, student_id, student2_id, used_booking_id, voided_at, expires_on')
      .not('source_booking_id', 'is', null).order('id')),
  ])

  // Session dates come in a second query on purpose: a nested join here has
  // failed silently in production on this project before.
  // Swim Assessments, for the per-pool section only: money paid for one
  // lesson rather than points, earned on the assessment's date at its pool.
  // A booking still waiting on its payment, or cancelled, earned nothing.
  readFailed('wallets', walletsErr)
  readFailed('points ledger', ledgerErr)
  readFailed('bookings', bookingsErr)
  readFailed('make-up vouchers', vouchersErr)

  const [pools, { data: assessmentRows, error: assessmentErr }] = await Promise.all([
    getLocations(svc as any),
    allRows(() => svc.from('bookings')
      .select('id, class_session_id, status, lesson_credit_id')
      .eq('is_trial', true).not('status', 'in', '(cancelled,pending_payment)')
      .not('lesson_credit_id', 'is', null).order('id')),
  ])
  // ?pools=1 shows the section with a single open pool too: a way to look at
  // it (and check it adds up) before a second pool opens to families.
  const byPool = showLocations(pools) || req.nextUrl.searchParams.get('pools') === '1'
  if (byPool) readFailed('Swim Assessment bookings', assessmentErr)

  const sessionIds = [...new Set([...(bookings || []), ...(byPool ? assessmentRows || [] : [])]
    .map((b: any) => b.class_session_id).filter(Boolean))]
  const dateById: Record<string, string> = {}
  // Where each lesson was taught. Every lesson has one (a database trigger
  // fills it from the coach's zone); a missing value is read as the first pool.
  const poolById: Record<string, string> = {}
  // A lesson whose date was not read is skipped below (owed nowhere, earned
  // nowhere), so a failed chunk is named rather than dropped (found 2026-10-15).
  const { data: sessRows, error: sessErr } = await allRowsIn(sessionIds, chunk => svc.from('class_sessions')
    .select('id, session_date, location_id').in('id', chunk).order('id'))
  readFailed('lesson dates', sessErr)
  for (const r of sessRows) { dateById[r.id] = r.session_date; poolById[r.id] = r.location_id || DEFAULT_LOCATION_ID }
  const poolOf = (sessionId: string | null | undefined) => (sessionId && poolById[sessionId]) || DEFAULT_LOCATION_ID

  // Which voucher, if any, a cancelled row's points now wait on. A voucher
  // names one source row, but the lesson it replaced may be several rows: the
  // two halves of an hour (lesson_group_id) or both seats of a sibling 1-on-2
  // (same session, the voucher's two students).
  const rowById = new Map<string, any>((bookings || []).map((b: any) => [b.id, b]))
  const voucherByGroup = new Map<string, any>()
  const voucherBySeat = new Map<string, any>()
  for (const v of (vouchers || []) as any[]) {
    const src = rowById.get(v.source_booking_id)
    if (!src) continue
    if (src.lesson_group_id) voucherByGroup.set(src.lesson_group_id, v)
    for (const sid of [v.student_id, v.student2_id].filter(Boolean)) voucherBySeat.set(`${src.class_session_id}|${sid}`, v)
  }
  const voucherFor = (b: any) => (b.lesson_group_id && voucherByGroup.get(b.lesson_group_id)) || voucherBySeat.get(`${b.class_session_id}|${b.student_id}`) || null
  /** The day a voucher's lesson is earned, or null while it is still owed --
   *  and at which pool: the make-up lesson's if it was used, otherwise the
   *  pool of the lesson the voucher replaced (owner, 2026-10-14). */
  const voucherEarnedOn = (v: any, sourceSession: string): { date: string; pool: string } | null => {
    if (v.status === 'used') {
      const used = v.used_booking_id ? rowById.get(v.used_booking_id) : null
      const d = used ? dateById[used.class_session_id] : null
      // Used but its make-up lesson cannot be found: count it when it was
      // claimed rather than lose it -- the family has had what it was owed.
      if (!d) return { date: today, pool: poolOf(sourceSession) }
      return d < today ? { date: d, pool: poolOf(used.class_session_id) } : null
    }
    if (v.status === 'expired') return { date: v.expires_on < today ? v.expires_on : today, pool: poolOf(sourceSession) }
    if (v.status === 'void') return { date: v.voided_at ? monthDayLA(v.voided_at) : today, pool: poolOf(sourceSession) }
    return null
  }

  let unearnedBooked = 0
  let voucherOwed = 0
  const voucherOwedIds = new Set<string>()
  const earnedByMonth: Record<string, number> = {}
  // The same figures split by pool: month -> pool -> points.
  const earnedByMonthPool: Record<string, Record<string, number>> = {}
  const bookedByPool: Record<string, number> = {}
  const earn = (date: string, pts: number, pool: string) => {
    const k = date.slice(0, 7)
    earnedByMonth[k] = (earnedByMonth[k] || 0) + pts
    const m = (earnedByMonthPool[k] ||= {})
    m[pool] = (m[pool] || 0) + pts
  }
  for (const b of (bookings || []) as any[]) {
    // Only the PURCHASED part of a lesson is owed or earned: the granted part
    // was a discount, never cash (see the header). It used to count the whole
    // charge, so a 65-point lesson paid with 50 bonus points showed 65 owed
    // (found 2026-10-04). A refund hands the granted part back first
    // (lib/bookings/refund.ts), so what is left granted is granted - refunded.
    const charged = Number(b.points_charged) || 0, refunded = Number(b.points_refunded) || 0
    const pts = (charged - refunded) - Math.max(0, (Number(b.points_granted) || 0) - refunded)
    if (pts <= 0) continue
    if (b.status === 'cancelled') {
      // A lesson given up for a voucher: owed until the voucher ends.
      const v = b.cancellation_reason !== 'rescheduled' ? voucherFor(b) : null
      if (v) {
        const on = voucherEarnedOn(v, b.class_session_id)
        if (on) earn(on.date, pts, on.pool)
        else { voucherOwed += pts; voucherOwedIds.add(v.id) }
        continue
      }
      if (!(b.cancelled_by === 'admin' && b.cancellation_reason === 'cancelled_by_parent')) continue
    }
    const date = dateById[b.class_session_id]
    if (!date) continue
    // A forfeited lesson is no longer owed, so it is never part of the
    // liability; it is earned on the day it would have been taught.
    if (date >= today && b.status !== 'cancelled') {
      unearnedBooked += pts
      const pool = poolOf(b.class_session_id)
      bookedByPool[pool] = (bookedByPool[pool] || 0) + pts
    } else earn(date, pts, poolOf(b.class_session_id))
  }

  const months: Record<string, { topUpCash: number; refundCash: number; purchasedIn: number; purchasedOut: number; granted: number; cashInCents: number; feeCents: number; feePending: number; sold: number; usedNet: number; writtenOff: number }> = {}
  const bucket = (k: string) => (months[k] ||= { topUpCash: 0, refundCash: 0, purchasedIn: 0, purchasedOut: 0, granted: 0, cashInCents: 0, feeCents: 0, feePending: 0, sold: 0, usedNet: 0, writtenOff: 0 })
  for (const r of (ledger || []) as Row[]) {
    const m = bucket(monthKeyLA(r.created_at))
    const dp = Number(r.delta_purchased) || 0
    if (dp >= 0) m.purchasedIn += dp
    else m.purchasedOut += -dp
    // purchasedIn/Out are raw ledger movement and reconcile to the wallets, but
    // they are NOT "sold" and "spent": a cancelled lesson adds its points to both
    // sides, so every cancellation inflated the two figures the accountant reads.
    // Sold is what was paid for; used is lesson traffic netted against its own
    // refunds. Money movements and manual adjustments are neither.
    if (r.reason === 'purchase') m.sold += dp
    else if (!NOT_LESSON_TRAFFIC.has(r.reason)) m.usedNet -= dp
    // Purchased points a manager took away by hand leave the liability with
    // nothing else on the page to show for it: not earned, not refunded, not
    // used (found 2026-10-15). Its own column, so the months add up. Except a
    // deduction for money refunded outside the site, which the refunds below
    // already count as cash refunded.
    if (r.reason === 'admin_deduct' && dp < 0 && r.pricing?.kind !== 'refunded_outside') m.writtenOff += -dp
    m.granted += Number(r.delta_granted) || 0
    if (r.reason === 'purchase') m.topUpCash += Number(r.amount_cents) || 0
    if (r.reason === 'cash_refund') m.refundCash += Number(r.amount_cents) || 0
    // ...less what did not arrive: cash_refund records the whole refund
    // asked for, and a leg Stripe refused (at once, or a bank account days
    // later) is taken off in the month it failed -- as the wallet's
    // total_refunded_cents does, so the all-time card and the months agree.
    if (r.reason === 'refund_failed') m.refundCash -= Number(r.amount_cents) || 0
  }

  let feeCentsTotal = 0
  let feePendingTotal = 0
  let cashInTotal = 0
  // A payment the bank took back counts for what it left: nothing for a bank
  // return or a full dispute (left out, as before), the undisputed rest of a
  // partial one.
  const reversedIn = await reversedCentsByPurchase(svc, (purchases || []).filter(p => p.reversed_at))
  for (const p of (purchases || []) as any[]) {
    if (!p.paid_at) continue
    const amt = (Number(p.amount_cents) || 0) - (reversedIn.get(p.id) ?? 0)
    if (p.reversed_at && amt <= 0) continue
    const m = bucket(monthKeyLA(p.paid_at))
    // Cash and fee are read from the same rows on purpose. The ledger's view of
    // a month is what turned into POINTS, which is not the same set: a Swim
    // Assessment is money in but never becomes points. Pairing a points-only
    // cash figure with a fee that covered the assessment too gave a net that
    // subtracted a fee from money it was not charged on.
    m.cashInCents += amt
    cashInTotal += amt
    if (p.fee_captured_at != null && p.fee_cents != null) {
      const fee = Number(p.fee_cents) || 0
      m.feeCents += fee
      feeCentsTotal += fee
    } else if (p.stripe_payment_intent_id || p.stripe_session_id) {
      // A Stripe payment whose fee is not known yet -- either identifier means
      // it went through Stripe. Cash at the desk has no fee at all and is not
      // pending anything.
      m.feePending += 1
      feePendingTotal += 1
    }
  }

  // Refunds made by hand in the Stripe dashboard (found 2026-10-15). The
  // webhook records one only as purchases.refunded_cents (dashboardRefund):
  // no cash_refund ledger row and no wallet total, so this page kept counting
  // the money while Sales showed it refunded -- every Swim Assessment refund
  // among them, since the dashboard is the only way to refund one.
  // refunded_cents also holds the site's own refunds (lib/refunds), which are
  // already counted above through their cash_refund ledger rows, so each
  // purchase's refund legs that did not fail are taken off first. A purchase
  // has no refund date, so the refund shows in the month of the payment.
  // A partly disputed payment can be refunded too (its undisputed rest), so
  // reversed rows come and are capped at what the bank left (found 2026-10-15).
  const { data: refundedRows, error: refundedErr } = await allRows(() => svc.from('purchases')
    .select('id, amount_cents, refunded_cents, paid_at, reversed_at, stripe_session_id, stripe_payment_intent_id')
    .eq('status', 'paid').gt('refunded_cents', 0).order('id'))
  readFailed('refunded payments', refundedErr)
  const reversedOfRefunded = await reversedCentsByPurchase(svc, refundedRows.filter(p => p.reversed_at))
  const siteLegCents: Record<string, number> = {}
  if (refundedRows.length > 0) {
    const { data: legs, error: legErr } = await allRowsIn(refundedRows.map((p: any) => p.id), ids =>
      svc.from('refund_legs').select('id, purchase_id, amount_cents').in('purchase_id', ids).neq('status', 'failed').order('id'))
    // Before docs/migration-refund-legs.sql there are no site refunds to
    // subtract (CASH_REFUND_ENABLED was off), so a failed read is only logged.
    if (legErr) console.error('finance: refund_legs not read:', legErr.message || legErr)
    for (const l of legs) siteLegCents[l.purchase_id] = (siteLegCents[l.purchase_id] || 0) + (Number(l.amount_cents) || 0)
  }
  let stripeRefundedTotal = 0
  for (const p of refundedRows as any[]) {
    const standing = (Number(p.amount_cents) || 0) - (reversedOfRefunded.get(p.id) ?? 0)
    if (standing <= 0) continue
    const cents = Math.max(0, Math.min(standing, Number(p.refunded_cents) || 0) - (siteLegCents[p.id] || 0))
    if (cents <= 0) continue
    stripeRefundedTotal += cents
    if (p.paid_at && Date.parse(p.paid_at) >= Date.parse(since)) bucket(monthKeyLA(p.paid_at)).refundCash += cents
  }

  const walletPurchased = (wallets || []).reduce((a: number, w: any) => a + (Number(w.balance_purchased) || 0), 0)
  const walletGranted = (wallets || []).reduce((a: number, w: any) => a + (Number(w.balance_granted) || 0), 0)
  const paidCents = (wallets || []).reduce((a: number, w: any) => a + (Number(w.total_paid_cents) || 0), 0)
  const refundedCents = (wallets || []).reduce((a: number, w: any) => a + (Number(w.total_refunded_cents) || 0), 0) + stripeRefundedTotal

  // Swim Assessment fees by month and pool: what the family paid for it, less
  // any refund, on the assessment's date once it has happened. A payment that
  // came back (reversed) earned nothing.
  const assessmentByMonthPool: Record<string, Record<string, number>> = {}
  if (byPool) {
    const past = ((assessmentRows || []) as any[]).filter(b => { const d = dateById[b.class_session_id]; return d && d < today })
    const creditIds = [...new Set(past.map(b => b.lesson_credit_id))]
    const purchaseByCredit: Record<string, string> = {}
    const { data: creditRows, error: creditErr } = await allRowsIn(creditIds, chunk =>
      svc.from('lesson_credits').select('id, purchase_id').in('id', chunk).order('id'))
    readFailed('Swim Assessment credits', creditErr)
    for (const r of creditRows) if (r.purchase_id) purchaseByCredit[r.id] = r.purchase_id
    const purchaseIds = [...new Set(Object.values(purchaseByCredit))]
    const paidById: Record<string, number> = {}
    const { data: paidRows, error: paidErr } = await allRowsIn(purchaseIds, chunk =>
      svc.from('purchases').select('id, amount_cents, refunded_cents, status, reversed_at').in('id', chunk).order('id'))
    readFailed('Swim Assessment payments', paidErr)
    for (const r of paidRows) {
      if (r.status !== 'paid' || r.reversed_at) continue
      paidById[r.id] = Math.max(0, (Number(r.amount_cents) || 0) - (Number(r.refunded_cents) || 0))
    }
    // One payment counted once, however many booking rows point at it.
    const counted = new Set<string>()
    for (const b of past) {
      const pid = purchaseByCredit[b.lesson_credit_id]
      if (!pid || counted.has(pid) || !paidById[pid]) continue
      counted.add(pid)
      const k = dateById[b.class_session_id].slice(0, 7)
      const pool = poolOf(b.class_session_id)
      const m = (assessmentByMonthPool[k] ||= {})
      m[pool] = (m[pool] || 0) + paidById[pid]
    }
  }

  const keys = [...new Set([...Object.keys(months), ...Object.keys(earnedByMonth), ...Object.keys(assessmentByMonthPool)])].sort().reverse().slice(0, 12)

  return NextResponse.json({
    today,
    liability: {
      refundable: walletPurchased,
      unearnedBooked,
      voucherOwed,
      vouchersOutstanding: voucherOwedIds.size,
      deferredTotal: walletPurchased + unearnedBooked + voucherOwed,
      granted: walletGranted,
      paidCents,
      refundedCents,
      // Over the reporting window, not all time -- fees are only recorded from
      // the month this started being captured.
      feeCents: feeCentsTotal,
      feePending: feePendingTotal,
      // Every payment taken, assessments included -- unlike paidCents, which
      // counts only what became points.
      cashInCents: cashInTotal,
    },
    // A zero fee total and "we could not read the fees" look identical on
    // screen, and one of them is a $0 that is not true. The migration not
    // having been run is exactly when this matters.
    feesUnavailable: purchasesErr ? (purchasesErr.message || 'could not read fees') : null,
    // The reads that failed, or null: the figures are then lower than the truth.
    incomplete: failedReads.length > 0 ? failedReads : null,
    // Per pool (owner, 2026-10-14), only while more than one pool is open to
    // families -- with one, the page reads exactly as it did before. Lesson
    // revenue in points (= dollars), assessments in cents.
    pools: byPool ? {
      list: pools.map(l => ({ id: l.id, name: l.name, active: l.is_active })),
      booked: bookedByPool,
      months: keys.map(k => ({ month: k, lessons: earnedByMonthPool[k] || {}, assessmentCents: assessmentByMonthPool[k] || {} })),
    } : null,
    months: keys.map(k => ({
      month: k,
      earned: earnedByMonth[k] || 0,
      topUpCash: months[k]?.topUpCash || 0,
      refundCash: months[k]?.refundCash || 0,
      purchasedIn: months[k]?.purchasedIn || 0,
      purchasedOut: months[k]?.purchasedOut || 0,
      sold: months[k]?.sold || 0,
      usedNet: months[k]?.usedNet || 0,
      writtenOff: months[k]?.writtenOff || 0,
      granted: months[k]?.granted || 0,
      cashIn: months[k]?.cashInCents || 0,
      feeCents: months[k]?.feeCents || 0,
      // Less what went back to families that month too (found 2026-10-15): a
      // Stripe dashboard refund used to stay in net cash in full.
      netCash: (months[k]?.cashInCents || 0) - (months[k]?.feeCents || 0) - (months[k]?.refundCash || 0),
      feePending: months[k]?.feePending || 0,
    })),
  })
}
