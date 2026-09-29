import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { walletSummary } from '@/lib/points-wallet'

export const runtime = 'nodejs'

// Balance, lessons completed, and remaining late-cancel
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
    /* The Swim Assessment is paid in dollars before a family has any points, so
       it never touches the ledger -- and its receipt had nowhere to be found,
       although the confirmation told the family it was on their dashboard. Each
       one joins the statement as its own line: no points, the dollar amount,
       and the receipt. Merged by date and cut back to the same length. */
    const { data: trialCredits } = await ctx.svc
      .from('lesson_credits').select('id, student_id')
      .eq('parent_id', ctx.parent.id).eq('is_trial', true)
    let payments: any[] = []
    if (trialCredits && trialCredits.length > 0) {
      const creditIds = trialCredits.map((c: any) => c.id)
      const studentIds = [...new Set(trialCredits.map((c: any) => c.student_id).filter(Boolean))]
      const [{ data: invs }, { data: studs }] = await Promise.all([
        ctx.svc.from('invoices').select('id, invoice_number, amount, created_at, lesson_credit_id')
          .eq('parent_id', ctx.parent.id).in('lesson_credit_id', creditIds)
          .order('created_at', { ascending: false }).limit(limit),
        studentIds.length
          ? ctx.svc.from('students').select('id, full_name').in('id', studentIds)
          : Promise.resolve({ data: [] as any[] }),
      ])
      const nameOf: Record<string, string> = {}
      for (const st of studs || []) nameOf[st.id] = st.full_name
      const studentOfCredit: Record<string, string> = {}
      for (const c of trialCredits) studentOfCredit[c.id] = nameOf[c.student_id] || ''
      payments = (invs || []).map((inv: any) => ({
        id: 'inv-' + inv.id,
        at: inv.created_at,
        points: 0,
        balanceAfter: null,
        reason: 'assessment',
        note: studentOfCredit[inv.lesson_credit_id] || null,
        amountCents: Math.round(Number(inv.amount || 0) * 100),
        bookingId: null,
        invoice: { id: inv.id, number: inv.invoice_number },
        payment: true,
      }))
    }
    const merged = [...history, ...payments]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, limit)
    return NextResponse.json({ ...summary, history: merged })
  } catch (e: any) {
    console.error('wallet summary error:', e)
    return NextResponse.json({ error: 'Could not read the wallet' }, { status: 500 })
  }
}
