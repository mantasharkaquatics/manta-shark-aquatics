import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { getTodayLA } from '@/lib/date'

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

type Row = { created_at: string; delta_purchased: number; delta_granted: number; reason: string; amount_cents: number | null }

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
const NOT_LESSON_TRAFFIC = new Set([
  'purchase', 'cash_refund', 'payment_failed', 'chargeback',
  'admin_grant', 'admin_deduct', 'referral_bonus', 'grant_expired',
])

/**
 * Every row a query matches, a page at a time. The API hands back at most
 * 1,000 rows per request, and a report that silently stopped at the first
 * thousand bookings would understate the liability without saying so. Each
 * query must be ordered by something unique so the pages do not overlap.
 */
async function allRows(make: () => any): Promise<{ data: any[]; error: any }> {
  const PAGE = 1000
  const out: any[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await make().range(from, from + PAGE - 1)
    if (error) return { data: out, error }
    out.push(...(data || []))
    if (!data || data.length < PAGE) return { data: out, error: null }
  }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = auth.svc

  const today = getTodayLA()
  const since = new Date(Date.now() - MONTHS_BACK * 31 * 86_400_000).toISOString()

  const [{ data: wallets }, { data: ledger }, { data: bookings }, { data: purchases, error: purchasesErr }, { data: vouchers }] = await Promise.all([
    allRows(() => svc.from('point_wallets').select('balance_purchased, balance_granted, total_paid_cents, total_refunded_cents').order('parent_id')),
    allRows(() => svc.from('point_ledger')
      .select('created_at, delta_purchased, delta_granted, reason, amount_cents')
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
    allRows(() => svc.from('purchases')
      .select('amount_cents, fee_cents, net_cents, fee_captured_at, paid_at, stripe_payment_intent_id, stripe_session_id')
      .eq('status', 'paid')
      .is('reversed_at', null)
      .gte('paid_at', since).order('id')),
    // Vouchers that replaced a lesson someone paid for. One issued by hand
    // (no source lesson) defers nothing: no points were taken for it.
    allRows(() => svc.from('make_up_vouchers')
      .select('id, status, source_booking_id, student_id, student2_id, used_booking_id, voided_at, expires_on')
      .not('source_booking_id', 'is', null).order('id')),
  ])

  // Session dates come in a second query on purpose: a nested join here has
  // failed silently in production on this project before.
  const sessionIds = [...new Set((bookings || []).map((b: any) => b.class_session_id).filter(Boolean))]
  const dateById: Record<string, string> = {}
  for (let i = 0; i < sessionIds.length; i += 500) {
    const { data: rows } = await svc.from('class_sessions')
      .select('id, session_date').in('id', sessionIds.slice(i, i + 500))
    for (const r of rows || []) dateById[r.id] = r.session_date
  }

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
  /** The day a voucher's lesson is earned, or null while it is still owed. */
  const voucherEarnedOn = (v: any): string | null => {
    if (v.status === 'used') {
      const used = v.used_booking_id ? rowById.get(v.used_booking_id) : null
      const d = used ? dateById[used.class_session_id] : null
      // Used but its make-up lesson cannot be found: count it when it was
      // claimed rather than lose it -- the family has had what it was owed.
      if (!d) return today
      return d < today ? d : null
    }
    if (v.status === 'expired') return v.expires_on < today ? v.expires_on : today
    if (v.status === 'void') return v.voided_at ? monthDayLA(v.voided_at) : today
    return null
  }

  let unearnedBooked = 0
  let voucherOwed = 0
  const voucherOwedIds = new Set<string>()
  const earnedByMonth: Record<string, number> = {}
  const earn = (date: string, pts: number) => { earnedByMonth[date.slice(0, 7)] = (earnedByMonth[date.slice(0, 7)] || 0) + pts }
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
        const on = voucherEarnedOn(v)
        if (on) earn(on, pts)
        else { voucherOwed += pts; voucherOwedIds.add(v.id) }
        continue
      }
      if (!(b.cancelled_by === 'admin' && b.cancellation_reason === 'cancelled_by_parent')) continue
    }
    const date = dateById[b.class_session_id]
    if (!date) continue
    // A forfeited lesson is no longer owed, so it is never part of the
    // liability; it is earned on the day it would have been taught.
    if (date >= today && b.status !== 'cancelled') unearnedBooked += pts
    else earn(date, pts)
  }

  const months: Record<string, { topUpCash: number; refundCash: number; purchasedIn: number; purchasedOut: number; granted: number; cashInCents: number; feeCents: number; feePending: number; sold: number; usedNet: number }> = {}
  const bucket = (k: string) => (months[k] ||= { topUpCash: 0, refundCash: 0, purchasedIn: 0, purchasedOut: 0, granted: 0, cashInCents: 0, feeCents: 0, feePending: 0, sold: 0, usedNet: 0 })
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
    m.granted += Number(r.delta_granted) || 0
    if (r.reason === 'purchase') m.topUpCash += Number(r.amount_cents) || 0
    if (r.reason === 'cash_refund') m.refundCash += Number(r.amount_cents) || 0
  }

  let feeCentsTotal = 0
  let feePendingTotal = 0
  let cashInTotal = 0
  for (const p of (purchases || []) as any[]) {
    if (!p.paid_at) continue
    const m = bucket(monthKeyLA(p.paid_at))
    // Cash and fee are read from the same rows on purpose. The ledger's view of
    // a month is what turned into POINTS, which is not the same set: a Swim
    // Assessment is money in but never becomes points. Pairing a points-only
    // cash figure with a fee that covered the assessment too gave a net that
    // subtracted a fee from money it was not charged on.
    const amt = Number(p.amount_cents) || 0
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

  const walletPurchased = (wallets || []).reduce((a: number, w: any) => a + (Number(w.balance_purchased) || 0), 0)
  const walletGranted = (wallets || []).reduce((a: number, w: any) => a + (Number(w.balance_granted) || 0), 0)
  const paidCents = (wallets || []).reduce((a: number, w: any) => a + (Number(w.total_paid_cents) || 0), 0)
  const refundedCents = (wallets || []).reduce((a: number, w: any) => a + (Number(w.total_refunded_cents) || 0), 0)

  const keys = [...new Set([...Object.keys(months), ...Object.keys(earnedByMonth)])].sort().reverse().slice(0, 12)

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
    months: keys.map(k => ({
      month: k,
      earned: earnedByMonth[k] || 0,
      topUpCash: months[k]?.topUpCash || 0,
      refundCash: months[k]?.refundCash || 0,
      purchasedIn: months[k]?.purchasedIn || 0,
      purchasedOut: months[k]?.purchasedOut || 0,
      sold: months[k]?.sold || 0,
      usedNet: months[k]?.usedNet || 0,
      granted: months[k]?.granted || 0,
      cashIn: months[k]?.cashInCents || 0,
      feeCents: months[k]?.feeCents || 0,
      netCash: (months[k]?.cashInCents || 0) - (months[k]?.feeCents || 0),
      feePending: months[k]?.feePending || 0,
    })),
  })
}
