import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { walletSummary, getWallet, arrears } from '@/lib/points-wallet'

export const runtime = 'nodejs'

// Balance, lessons completed, and remaining late-cancel
// forgiveness -- everything the dashboard card and the booking page need, in
// one call. Replaces /api/parent/tokens.
//
// ?history=N also returns the last N movements. The statement is the answer to
// "where did my points go", and a family who cannot answer that question
// themselves will ask us instead.
//
// The whole statement, a page at a time (found 2026-10-08): the dashboard
// asked for 12 lines and had no way to reach the 13th, so a purchase -- the
// only line with its receipt, which the invoice email sends families here
// for -- dropped out of reach after a few weeks of bookings. Each page answers
// nextBefore; passing it back as ?before= returns the lines older than that,
// and null means there are none. ?only=history (and any ?before=) skips the
// balance summary, which a page of older lines does not need.
//
// Timestamps are compared to the microsecond: the database stores them that
// finely, and two lines a millisecond apart must not be taken as one.
const tsMicros = (s: string): number => {
  const ms = Date.parse(s)
  if (isNaN(ms)) return 0
  const frac = (String(s).match(/T\d{2}:\d{2}:\d{2}\.(\d+)/)?.[1] || '').padEnd(6, '0').slice(0, 6)
  return Math.floor(ms / 1000) * 1_000_000 + Number(frac)
}
const BEFORE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})?$/

export async function GET(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    const params = req.nextUrl.searchParams
    // ?session=cs_... : has this top-up's checkout been credited yet? Asked by
    // the payment success page, which used to say "points added" before the
    // webhook had added them (found 2026-10-08).
    // ?only=arrears : the plans page needs one number, what the family owes
    // (found 2026-10-08: it ran the whole summary -- lessons completed, grant
    // lots, forgiveness -- to read this one field). One wallet row.
    if (params.get('only') === 'arrears') {
      return NextResponse.json({ arrears: arrears(await getWallet(ctx.svc, ctx.parent.id)) })
    }
    const sessionId = params.get('session')
    if (sessionId) {
      const summary = await walletSummary(ctx.svc, ctx.parent.id)
      const { data: hit } = await ctx.svc.from('point_ledger').select('id')
        .eq('parent_id', ctx.parent.id).eq('reason', 'purchase').eq('stripe_session_id', sessionId).limit(1)
      return NextResponse.json({ ...summary, credited: !!(hit && hit.length > 0) })
    }
    const before = params.get('before')
    if (before != null && (!BEFORE_RE.test(before) || isNaN(Date.parse(before)))) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const want = Number(params.get('history') || 0)
    if (!want) return NextResponse.json(await walletSummary(ctx.svc, ctx.parent.id))
    const summary = (before || params.get('only') === 'history') ? null : await walletSummary(ctx.svc, ctx.parent.id)

    const limit = Math.min(100, Math.max(1, Math.floor(want)))
    // Read past the page: lines that are merged below (a fixed class ended
    // with a refund writes one row per half-lesson) must not push the rest
    // of the page out.
    const RAW = Math.min(400, limit * 4)
    let ledgerQ = ctx.svc
      .from('point_ledger')
      .select('id, created_at, delta_purchased, delta_granted, balance_purchased_after, balance_granted_after, reason, note, amount_cents, booking_id, stripe_session_id, pricing')
      .eq('parent_id', ctx.parent.id)
    if (before) ledgerQ = ledgerQ.lt('created_at', before)
    const { data: rows } = await ledgerQ
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(RAW)

    // A top-up row carries a receipt. The invoice email tells the family to come
    // to the dashboard for it, so the statement line for the money has to be
    // able to reach it -- points are prepaid cash, and a receipt for prepaid
    // cash is not a nice-to-have.
    //
    // A sale at the front desk (pos/complete-sale, complete-sdp-sale) has no
    // checkout session: its ledger row carries the card's payment intent, or
    // nothing for cash, and its invoice only the payment intent -- so the
    // receipt its email pointed to the dashboard for could not be reached
    // (found 2026-10-07). Desk sales now key the invoice as `pos:<purchase
    // id>`, the purchase the ledger row names in its pricing; older desk card
    // sales are found by their payment intent.
    const posKey = (r: any) => (r.pricing?.kind === 'pos_purchase' && r.pricing?.purchaseId) ? `pos:${r.pricing.purchaseId}` : null
    const purchaseRows = (rows || []).filter((r: any) => r.reason === 'purchase')
    const sessions = [...new Set(purchaseRows.flatMap((r: any) => [r.stripe_session_id, posKey(r)]).filter(Boolean))] as string[]
    const invoiceBySession = new Map<string, { id: string; number: string }>()
    if (sessions.length) {
      const [{ data: invs }, { data: byPi }] = await Promise.all([
        ctx.svc
          .from('invoices')
          .select('id, invoice_number, stripe_session_id')
          .eq('parent_id', ctx.parent.id)
          .in('stripe_session_id', sessions),
        ctx.svc
          .from('invoices')
          .select('id, invoice_number, stripe_payment_intent_id')
          .eq('parent_id', ctx.parent.id)
          .in('stripe_payment_intent_id', sessions),
      ])
      for (const inv of byPi || []) {
        if (inv.stripe_payment_intent_id) invoiceBySession.set(inv.stripe_payment_intent_id, { id: inv.id, number: inv.invoice_number })
      }
      for (const inv of invs || []) {
        invoiceBySession.set(inv.stripe_session_id, { id: inv.id, number: inv.invoice_number })
      }
    }
    const invoiceOf = (r: any) => {
      if (r.reason !== 'purchase') return null
      const k = posKey(r)
      return (k && invoiceBySession.get(k)) || (r.stripe_session_id && invoiceBySession.get(r.stripe_session_id)) || null
    }

    // Which lesson a line was about. "Booked" and "cancelled" lines were
    // anonymous, so a family with several swimmers could not tell whose points
    // moved. A refund carries its booking; a batch booking carries its dates
    // in the pricing it was charged at.
    const bookingIds = [...new Set((rows || []).map((r: any) => r.booking_id).filter(Boolean))] as string[]
    const lessonOfBooking = new Map<string, { student: string | null; date: string; time: string | null; fixedClassId: string | null; lessonKey: string }>()
    if (bookingIds.length) {
      const { data: bks } = await ctx.svc.from('bookings')
        .select('id, student_id, class_session_id, fixed_class_id, lesson_group_id').in('id', bookingIds)
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
        lessonOfBooking.set(b.id, { student: nm.get(b.student_id) ?? null, date: se.session_date, time: String(se.start_time || '').slice(0, 5) || null,
          fixedClassId: b.fixed_class_id ?? null, lessonKey: b.lesson_group_id || b.class_session_id })
      }
    }
    // A single, hour or cart booking is debited before its booking row exists,
    // so the debit names its lesson and swimmers in its pricing instead
    // (rows written before 2026-10-03 have neither, and stay anonymous).
    const pricedKids = new Set<string>()
    for (const r of rows || []) {
      const pr: any = r.pricing
      if ((pr?.kind === 'single' || pr?.kind === 'weekly_term' || pr?.kind === 'multi_slot') && Array.isArray(pr.students)) pr.students.forEach((s: any) => s && pricedKids.add(String(s)))
      if (pr?.kind === 'cart' && Array.isArray(pr.items)) pr.items.forEach((it: any) => it?.student && pricedKids.add(String(it.student)))
    }
    const kidName = new Map<string, string>()
    if (pricedKids.size) {
      const { data: ks } = await ctx.svc.from('students').select('id, full_name')
        .eq('parent_id', ctx.parent.id).in('id', [...pricedKids])
      for (const k of ks || []) kidName.set(k.id, k.full_name)
    }
    const namesOf = (ids: any[]) => {
      const n = [...new Set(ids.map(i => kidName.get(String(i))).filter(Boolean))]
      return n.length ? n.join(' & ') : null
    }
    const lessonOf = (r: any) => {
      if (r.booking_id && lessonOfBooking.has(r.booking_id)) {
        const l = lessonOfBooking.get(r.booking_id)!
        return { student: l.student, date: l.date, time: l.time, count: 1 }
      }
      const pr = r.pricing
      if (pr?.kind === 'single' && pr.date) {
        return { student: namesOf(Array.isArray(pr.students) ? pr.students : []), date: String(pr.date), time: pr.startTime ? String(pr.startTime).slice(0, 5) : null, count: 1 }
      }
      if (pr?.kind === 'cart' && Array.isArray(pr.items) && pr.items.length) {
        const it = [...pr.items].sort((a: any, b: any) => String(a.date + a.time).localeCompare(String(b.date + b.time)))
        return { student: namesOf(it.map((x: any) => x.student).filter(Boolean)), date: String(it[0].date), time: it.length === 1 ? String(it[0].time).slice(0, 5) : null, count: it.length }
      }
      if (pr?.kind === 'weekly_term' && Array.isArray(pr.dates) && pr.dates.length) {
        const ds = pr.dates.map((d: any) => String(d.date)).sort()
        return { student: Array.isArray(pr.students) ? namesOf(pr.students) : null, date: ds[0], time: pr.startTime ? String(pr.startTime).slice(0, 5) : null, count: ds.length }
      }
      if (pr?.kind === 'multi_slot' && Array.isArray(pr.slots) && pr.slots.length) {
        const sl = [...pr.slots].sort((a: any, b: any) => String(a.date + a.startTime).localeCompare(String(b.date + b.startTime)))
        return { student: Array.isArray(pr.students) ? namesOf(pr.students) : null, date: String(sl[0].date), time: sl.length === 1 ? String(sl[0].startTime).slice(0, 5) : null, count: sl.length }
      }
      return null
    }

    // The parent sees one balance, so the statement shows one delta. The split
    // between purchased and granted matters only to a refund, and a refund is
    // not something this screen does.
    const lines = (rows || []).map((r: any) => ({
      id: r.id,
      at: r.created_at,
      points: (r.delta_purchased || 0) + (r.delta_granted || 0),
      balanceAfter: (r.balance_purchased_after || 0) + (r.balance_granted_after || 0),
      reason: r.reason,
      note: r.note,
      amountCents: r.amount_cents,
      bookingId: r.booking_id,
      lesson: lessonOf(r),
      invoice: invoiceOf(r),
      // The oldest ledger row a line stands for; a merged line covers several.
      _min: r.created_at as string,
    }))
    const oldestOf = (xs: { _min: string }[]) => xs.reduce((a, x) => (tsMicros(x._min) < tsMicros(a) ? x._min : a), xs[0]._min)
    /* Ending a fixed class with a refund returns each remaining lesson on its
       own ledger row -- one per half of a 60-minute lesson -- so a 10-lesson
       class put 20 lines of +65 on the family's statement. The family sees ONE
       line for it (owner, 2026-10-04); the ledger itself keeps every row. The
       reason the desk typed is for staff, so the merged line does not carry it. */
    const endKey = (r: any) => {
      if (r.reason !== 'cancel_refund' || !String(r.note || '').startsWith('Fixed class ended') || !r.bookingId) return null
      const l = lessonOfBooking.get(r.bookingId)
      return l?.fixedClassId ? l.fixedClassId : null
    }
    const ended = new Map<string, any[]>()
    for (const r of lines) { const k = endKey(r); if (k) ended.set(k, [...(ended.get(k) || []), r]) }
    const history: any[] = []
    for (const r of lines) {
      const k = endKey(r)
      if (!k) { history.push(r); continue }
      const grp = ended.get(k)!
      if (grp[0] !== r) continue // newest row stands for the group
      const ls = grp.map(x => lessonOfBooking.get(x.bookingId)!).filter(Boolean)
      const kids = [...new Set(ls.map(l => l.student).filter(Boolean))]
      history.push({
        ...r,
        id: 'fc-end-' + k,
        points: grp.reduce((a, x) => a + x.points, 0),
        reason: 'fixed_class_end',
        note: null,
        bookingId: null,
        lesson: { student: kids.length ? kids.join(' & ') : null, date: ls.map(l => l.date).sort()[0], time: null, count: new Set(ls.map(l => l.lessonKey)).size },
        _min: oldestOf(grp),
      })
    }
    /* The same for one lesson: a 60-minute lesson is two rows and a sibling
       1-on-2 two seats, each refunded on its own row, so a sibling hour put four
       lines of +50 where the family cancelled one lesson (owner, 2026-10-04).
       Rows of the same reason for the same lesson written within minutes of
       each other are one line; a later cancellation of a re-booked slot is not. */
    const WINDOW_MS = 10 * 60 * 1000
    const groupLesson = <T extends { at: string }>(list: T[], keyOf: (x: T) => string | null, combine: (grp: T[]) => T): T[] => {
      const open = new Map<string, T[]>()
      const out: (T | T[])[] = []
      for (const x of list) {
        const k = keyOf(x)
        if (!k) { out.push(x); continue }
        const g = open.get(k)
        if (g && new Date(g[0].at).getTime() - new Date(x.at).getTime() <= WINDOW_MS) { g.push(x); continue }
        const ng = [x]; open.set(k, ng); out.push(ng)
      }
      return out.map(x => Array.isArray(x) ? (x.length === 1 ? x[0] : combine(x)) : x)
    }
    const combineLesson = (grp: any[]) => {
      const ls = grp.map((x: any) => x.lesson).filter(Boolean)
      const kids = [...new Set(ls.map((l: any) => l.student).filter(Boolean))].sort()
      const first = [...ls].sort((a: any, b: any) => String(a.date + (a.time || '')).localeCompare(String(b.date + (b.time || ''))))[0]
      return {
        ...grp[0],
        id: grp[0].id + '-lesson',
        points: grp.reduce((a: number, x: any) => a + (x.points || 0), 0),
        ...(grp[0].kept != null ? { kept: grp.reduce((a: number, x: any) => a + (x.kept || 0), 0) } : {}),
        lesson: first ? { ...first, student: kids.length ? kids.join(' & ') : null, count: 1 } : grp[0].lesson,
        _min: oldestOf(grp),
      }
    }
    const refundKey = (r: any) => {
      if (!['cancel_refund', 'school_cancel'].includes(r.reason) || !r.bookingId) return null
      const l = lessonOfBooking.get(r.bookingId)
      return l ? `${r.reason}|${l.lessonKey}` : null
    }
    const historyLines = groupLesson(history, refundKey, combineLesson)
    /* The Swim Assessment is paid in dollars before a family has any points, so
       it never touches the ledger -- and its receipt had nowhere to be found,
       although the confirmation told the family it was on their dashboard. Each
       one joins the statement as its own line: no points, the dollar amount,
       and the receipt. Merged by date and cut back to the same length. */
    // Where each source stopped, when it filled its read: older rows exist there
    // that this page has not seen.
    const full: string[] = []
    if (rows && rows.length >= RAW) full.push(rows[rows.length - 1].created_at)
    const { data: trialCredits } = await ctx.svc
      .from('lesson_credits').select('id, student_id')
      .eq('parent_id', ctx.parent.id).eq('is_trial', true)
    let payments: any[] = []
    if (trialCredits && trialCredits.length > 0) {
      const creditIds = trialCredits.map((c: any) => c.id)
      const studentIds = [...new Set(trialCredits.map((c: any) => c.student_id).filter(Boolean))]
      let invQ = ctx.svc.from('invoices').select('id, invoice_number, amount, created_at, lesson_credit_id')
        .eq('parent_id', ctx.parent.id).in('lesson_credit_id', creditIds)
      if (before) invQ = invQ.lt('created_at', before)
      const [{ data: invs }, { data: studs }] = await Promise.all([
        invQ.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit),
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
        _min: inv.created_at as string,
      }))
      if (invs && invs.length >= limit) full.push(invs[invs.length - 1].created_at)
    }
    /* A late cancellation the desk makes without a refund keeps the points,
       and it moves nothing in the ledger -- the points left the wallet when the
       lesson was booked. Without a line of its own, the lesson just vanished
       from "upcoming" and the family was left with a bare "booked -40" to puzzle
       over. It joins the statement as an information line: which lesson, and
       how many points were not returned. Admin cancel-booking with refund:false
       is the only writer of cancelled_by 'admin' + reason 'cancelled_by_parent'. */
    let lateQ = ctx.svc.from('bookings')
      .select('id, student_id, class_session_id, cancelled_at, points_charged, points_refunded, lesson_group_id')
      .eq('parent_id', ctx.parent.id).eq('status', 'cancelled')
      .eq('cancelled_by', 'admin').eq('cancellation_reason', 'cancelled_by_parent')
      .not('cancelled_at', 'is', null)
    if (before) lateQ = lateQ.lt('cancelled_at', before)
    const { data: lateRows } = await lateQ
      .order('cancelled_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
    if (lateRows && lateRows.length >= limit) full.push(lateRows[lateRows.length - 1].cancelled_at)
    // The desk's "make-up voucher" cancel and "end fixed class -> vouchers"
    // write the same admin + cancelled_by_parent pair, but the family got a
    // voucher for those -- they are not late cancellations kept without
    // refund (found 2026-10-03).
    let converted = new Set<string>()
    if ((lateRows || []).length) {
      const { data: vs } = await ctx.svc.from('make_up_vouchers').select('source_booking_id')
        .in('source_booking_id', (lateRows || []).map((b: any) => b.id))
      converted = new Set((vs || []).map((v: any) => v.source_booking_id))
    }
    // An hour's voucher names one half; the other half went with it.
    const convertedGroups = new Set((lateRows || []).filter((b: any) => converted.has(b.id) && b.lesson_group_id).map((b: any) => b.lesson_group_id))
    // A sibling 1-on-2's voucher names one seat; the other seat shares the session.
    const convertedSessions = new Set((lateRows || []).filter((b: any) => converted.has(b.id)).map((b: any) => b.class_session_id))
    const kept = (lateRows || []).filter((b: any) => !converted.has(b.id) && !(b.lesson_group_id && convertedGroups.has(b.lesson_group_id))
      && !convertedSessions.has(b.class_session_id)
      && (Number(b.points_charged) || 0) - (Number(b.points_refunded) || 0) > 0)
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
          _key: b.lesson_group_id || b.class_session_id,
          _min: b.cancelled_at as string,
        }
      })
      // One lesson, one line: both halves of an hour, both seats of a sibling 1-on-2.
      lateLines = groupLesson(lateLines, (x: any) => x._key || null, combineLesson).map(({ _key, ...x }: any) => x)
    }
    const merged = [...historyLines, ...payments, ...lateLines]
      .sort((a, b) => tsMicros(b.at) - tsMicros(a.at))

    /* Cut the page where nothing is split. A line is only safe to show when
       every row it could merge with was read: lines merge with rows up to
       WINDOW_MS older, so anything that close to where a full read stopped
       waits for the next page. And a page ends only between lines that do not
       overlap, so the next page -- everything older than the oldest row shown
       -- neither repeats a row nor skips one. */
    const floor = full.length ? Math.max(...full.map(tsMicros)) + WINDOW_MS * 1000 : -Infinity
    const oldest = (xs: { _min: string }[]) => xs.reduce((a, x) => Math.min(a, tsMicros(x._min)), Infinity)
    let page: typeof merged = []
    let stop = merged.length // merged[stop] is the first line left for the next page
    for (let i = 0; i < merged.length; i++) {
      const at = tsMicros(merged[i].at)
      if (at <= floor || (page.length >= limit && at < oldest(page))) { stop = i; break }
      page.push(merged[i])
    }
    // Every line left out must be older than every row shown.
    while (page.length && stop < merged.length && oldest(page) <= tsMicros(merged[stop].at)) { page.pop(); stop-- }
    // Hundreds of rows inside ten minutes (never seen): show them rather than nothing.
    if (page.length === 0 && merged.length > 0) { page = merged.slice(0, limit); stop = page.length }
    const cursorLine = page.reduce<{ _min: string } | null>((a, x) => (!a || tsMicros(x._min) < tsMicros(a._min) ? x : a), null)
    const cursor: string | null = cursorLine ? cursorLine._min : null
    const more = stop < merged.length || full.length > 0
    const shown = page.map(({ _min, ...x }) => x)
    return NextResponse.json({ ...(summary || {}), history: shown, nextBefore: more ? cursor : null })
  } catch (e: any) {
    console.error('wallet summary error:', e)
    return NextResponse.json({ error: 'Could not read the wallet' }, { status: 500 })
  }
}
