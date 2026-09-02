import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { walletSummary } from '@/lib/points-wallet'

export const runtime = 'nodejs'

// Balance, VIP tier, progress to the next one, and remaining late-cancel
// forgiveness -- everything the dashboard card and the booking page need, in
// one call. Replaces /api/parent/tokens.
//
// ?history=N also returns the last N movements. The statement is the answer to
// "where did my points go", and a family who cannot answer that question
// themselves will ask us instead.
export async function GET(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    const summary = await walletSummary(ctx.svc, ctx.parent.id)
    const want = Number(req.nextUrl.searchParams.get('history') || 0)
    if (!want) return NextResponse.json(summary)

    const limit = Math.min(100, Math.max(1, Math.floor(want)))
    const { data: rows } = await ctx.svc
      .from('point_ledger')
      .select('id, created_at, delta_purchased, delta_granted, balance_purchased_after, balance_granted_after, reason, note, amount_cents, booking_id, stripe_session_id')
      .eq('parent_id', ctx.parent.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    // A top-up row carries a receipt. The invoice email tells the family to come
    // to the dashboard for it, so the statement line for the money has to be
    // able to reach it -- points are prepaid cash, and a receipt for prepaid
    // cash is not a nice-to-have.
    const sessions = (rows || [])
      .filter((r: any) => r.reason === 'purchase' && r.stripe_session_id)
      .map((r: any) => r.stripe_session_id)
    const invoiceBySession = new Map<string, { id: string; number: string }>()
    if (sessions.length) {
      const { data: invs } = await ctx.svc
        .from('invoices')
        .select('id, invoice_number, stripe_session_id')
        .eq('parent_id', ctx.parent.id)
        .in('stripe_session_id', sessions)
      for (const inv of invs || []) {
        invoiceBySession.set(inv.stripe_session_id, { id: inv.id, number: inv.invoice_number })
      }
    }

    // The parent sees one balance, so the statement shows one delta. The split
    // between purchased and granted matters only to a refund, and a refund is
    // not something this screen does.
    const history = (rows || []).map((r: any) => ({
      id: r.id,
      at: r.created_at,
      points: (r.delta_purchased || 0) + (r.delta_granted || 0),
      balanceAfter: (r.balance_purchased_after || 0) + (r.balance_granted_after || 0),
      reason: r.reason,
      note: r.note,
      amountCents: r.amount_cents,
      bookingId: r.booking_id,
      invoice: (r.reason === 'purchase' && r.stripe_session_id)
        ? invoiceBySession.get(r.stripe_session_id) ?? null
        : null,
    }))
    return NextResponse.json({ ...summary, history })
  } catch (e: any) {
    console.error('wallet summary error:', e)
    return NextResponse.json({ error: 'Could not read the wallet' }, { status: 500 })
  }
}
