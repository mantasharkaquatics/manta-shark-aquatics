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
      .select('id, created_at, delta_purchased, delta_granted, balance_purchased_after, balance_granted_after, reason, note, amount_cents, booking_id, stripe_session_id, pricing')
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

    // Which lesson a line was about. "Booked" and "cancelled" lines were
    // anonymous, so a family with several swimmers could not tell whose points
    // moved. A refund carries its booking; a batch booking carries its dates
    // in the pricing it was charged at.
    const bookingIds = [...new Set((rows || []).map((r: any) => r.booking_id).filter(Boolean))] as string[]
    const lessonOfBooking = new Map<string, { student: string | null; date: string; time: string | null }>()
    if (bookingIds.length) {
      const { data: bks } = await ctx.svc.from('bookings')
        .select('id, student_id, class_session_id').in('id', bookingIds)
      const sIds = [...new Set((bks || []).map((b: any) => b.student_id).filter(Boolean))]
      const cIds = [...new Set((bks || []).map((b: any) => b.class_session_id).filter(Boolean))]
      const [{ data: sts }, { data: cs }] = await Promise.all([
        sIds.length ? ctx.svc.from('students').select('id, full_name').in('id', sIds) : Promise.resolve({ data: [] as any[] }),
        cIds.length ? ctx.svc.from('class_sessions').select('id, session_date, start_time').in('id', cIds) : Promise.resolve({ data: [] as any[] }),
      ])
      const nm = new Map((sts || []).map((x: any) => [x.id, x.full_name]))
      const sess = new Map((cs || []).map((x: any) => [x.id, x]))
      for (const b of bks || []) {
        const se: any = sess.get(b.class_session_id)
        if (!se) continue
        lessonOfBooking.set(b.id, { student: nm.get(b.student_id) ?? null, date: se.session_date, time: String(se.start_time || '').slice(0, 5) || null })
      }
    }
    const lessonOf = (r: any) => {
      if (r.booking_id && lessonOfBooking.has(r.booking_id)) {
        const l = lessonOfBooking.get(r.booking_id)!
        return { student: l.student, date: l.date, time: l.time, count: 1 }
      }
      const pr = r.pricing
      if (pr?.kind === 'weekly_term' && Array.isArray(pr.dates) && pr.dates.length) {
        const ds = pr.dates.map((d: any) => String(d.date)).sort()
        return { student: null, date: ds[0], time: pr.startTime ? String(pr.startTime).slice(0, 5) : null, count: ds.length }
      }
      if (pr?.kind === 'multi_slot' && Array.isArray(pr.slots) && pr.slots.length) {
        const sl = [...pr.slots].sort((a: any, b: any) => String(a.date + a.startTime).localeCompare(String(b.date + b.startTime)))
        return { student: null, date: String(sl[0].date), time: sl.length === 1 ? String(sl[0].startTime).slice(0, 5) : null, count: sl.length }
      }
      return null
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
      lesson: lessonOf(r),
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
    /* A late cancellation the desk makes without a refund keeps the points,
       and it moves nothing in the ledger -- the points left the wallet when the
       lesson was booked. Without a line of its own, the lesson just vanished
       from "upcoming" and the family was left with a bare "booked -40" to puzzle
       over. It joins the statement as an information line: which lesson, and
       how many points were not returned. Admin cancel-booking with refund:false
       is the only writer of cancelled_by 'admin' + reason 'cancelled_by_parent'. */
    const { data: lateRows } = await ctx.svc.from('bookings')
      .select('id, student_id, class_session_id, cancelled_at, points_charged, points_refunded')
      .eq('parent_id', ctx.parent.id).eq('status', 'cancelled')
      .eq('cancelled_by', 'admin').eq('cancellation_reason', 'cancelled_by_parent')
      .order('cancelled_at', { ascending: false }).limit(limit)
    const kept = (lateRows || []).filter((b: any) => (Number(b.points_charged) || 0) - (Number(b.points_refunded) || 0) > 0)
    let lateLines: any[] = []
    if (kept.length) {
      const sIds = [...new Set(kept.map((b: any) => b.student_id).filter(Boolean))]
      const cIds = [...new Set(kept.map((b: any) => b.class_session_id).filter(Boolean))]
      const [{ data: sts }, { data: cs }] = await Promise.all([
        sIds.length ? ctx.svc.from('students').select('id, full_name').in('id', sIds) : Promise.resolve({ data: [] as any[] }),
        cIds.length ? ctx.svc.from('class_sessions').select('id, session_date, start_time').in('id', cIds) : Promise.resolve({ data: [] as any[] }),
      ])
      const nm = new Map((sts || []).map((x: any) => [x.id, x.full_name]))
      const sess = new Map((cs || []).map((x: any) => [x.id, x]))
      lateLines = kept.map((b: any) => {
        const se: any = sess.get(b.class_session_id)
        return {
          id: 'late-' + b.id,
          at: b.cancelled_at,
          points: 0,
          balanceAfter: null,
          reason: 'late_cancel',
          note: null,
          amountCents: null,
          bookingId: b.id,
          lesson: se ? { student: nm.get(b.student_id) ?? null, date: se.session_date, time: String(se.start_time || '').slice(0, 5) || null, count: 1 } : null,
          invoice: null,
          kept: (Number(b.points_charged) || 0) - (Number(b.points_refunded) || 0),
        }
      })
    }
    const merged = [...history, ...payments, ...lateLines]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, limit)
    return NextResponse.json({ ...summary, history: merged })
  } catch (e: any) {
    console.error('wallet summary error:', e)
    return NextResponse.json({ error: 'Could not read the wallet' }, { status: 500 })
  }
}
