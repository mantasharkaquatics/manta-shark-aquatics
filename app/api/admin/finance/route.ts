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
function monthKeyLA(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit',
  }).format(new Date(iso)).slice(0, 7)
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const svc = auth.svc

  const today = getTodayLA()
  const since = new Date(Date.now() - MONTHS_BACK * 31 * 86_400_000).toISOString()

  const [{ data: wallets }, { data: ledger }, { data: bookings }] = await Promise.all([
    svc.from('point_wallets').select('balance_purchased, balance_granted, total_paid_cents, total_refunded_cents'),
    svc.from('point_ledger')
      .select('created_at, delta_purchased, delta_granted, reason, amount_cents')
      .gte('created_at', since)
      .order('created_at', { ascending: true }),
    // Everything not cancelled that carries points. Deliberately NOT an
    // allow-list of statuses: a liability report must over-include rather than
    // miss an obligation, and a status added later (or one this file's author
    // did not know about) would silently drop points out of the total. The
    // points_charged filter is what makes it safe -- a row with no points
    // against it is nothing owed.
    svc.from('bookings')
      .select('points_charged, status, class_session_id')
      .neq('status', 'cancelled')
      .not('points_charged', 'is', null),
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

  let unearnedBooked = 0
  const earnedByMonth: Record<string, number> = {}
  for (const b of (bookings || []) as any[]) {
    const date = dateById[b.class_session_id]
    if (!date) continue
    const pts = Number(b.points_charged) || 0
    if (date >= today) unearnedBooked += pts
    else earnedByMonth[date.slice(0, 7)] = (earnedByMonth[date.slice(0, 7)] || 0) + pts
  }

  const months: Record<string, { topUpCash: number; refundCash: number; purchasedIn: number; purchasedOut: number; granted: number }> = {}
  const bucket = (k: string) => (months[k] ||= { topUpCash: 0, refundCash: 0, purchasedIn: 0, purchasedOut: 0, granted: 0 })
  for (const r of (ledger || []) as Row[]) {
    const m = bucket(monthKeyLA(r.created_at))
    const dp = Number(r.delta_purchased) || 0
    if (dp >= 0) m.purchasedIn += dp
    else m.purchasedOut += -dp
    m.granted += Number(r.delta_granted) || 0
    if (r.reason === 'purchase') m.topUpCash += Number(r.amount_cents) || 0
    if (r.reason === 'cash_refund') m.refundCash += Number(r.amount_cents) || 0
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
      deferredTotal: walletPurchased + unearnedBooked,
      granted: walletGranted,
      paidCents,
      refundedCents,
    },
    months: keys.map(k => ({
      month: k,
      earned: earnedByMonth[k] || 0,
      topUpCash: months[k]?.topUpCash || 0,
      refundCash: months[k]?.refundCash || 0,
      purchasedIn: months[k]?.purchasedIn || 0,
      purchasedOut: months[k]?.purchasedOut || 0,
      granted: months[k]?.granted || 0,
    })),
  })
}
