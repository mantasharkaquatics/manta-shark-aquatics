import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { centsToPoints } from '@/lib/points'
import { applyPoints } from '@/lib/points-wallet'
import { insertInvoice } from '@/lib/invoices/create'
import { checkPointsSale, invoicePaymentLabel } from '@/lib/pos/sale-checks'

// Selling points at the front desk. The same thing the parent buys online, put
// through by an admin who takes the card or the cash.
//
// Two kinds of points can come out of one sale. Purchased points are worth a
// dollar each and are refundable for cash at that rate. Bonus points -- a
// promotion, a goodwill gesture, a negotiated rate -- are granted, spend
// exactly the same way, and cannot be cashed out. That split is what lets the
// school run "buy $1,000, get 100" without ever selling a dollar for less than
// a dollar, which is the hole every refundable purchase discount opens.

// How recently an identical cash sale counts as the same sale. Long enough to
// cover a double-click and a retry, short enough not to block a real second
// payment while the family is still standing there.
const DUPLICATE_WINDOW_MS = 90_000

export async function POST(req: NextRequest) {
  try {
    const { parentId, amountCents, bonusPoints, paymentMethod, paymentIntentId, note } = await req.json()

    const cookieStore = await cookies()
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )
    const { data: { user } } = await supabaseAuth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: admin } = await supabaseAuth.from('admins').select('id').eq('auth_user_id', user.id).single()
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // The same checks the terminal PaymentIntent was made under, so a card
    // sale that got this far passes them here too (lib/pos/sale-checks).
    const sale = checkPointsSale({ parentId, amountCents, bonusPoints })
    if (!sale.ok) return NextResponse.json({ error: sale.error }, { status: sale.status })
    const { amountCents: amount, dollars, bonus } = sale

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // A sale can be recorded twice if the front desk double-clicks or the
    // screen retries. A terminal payment has a payment intent to key on; cash
    // and cheques have nothing, which is why this guard used to be skipped
    // entirely for exactly the payments nobody can trace afterwards.
    if (paymentIntentId) {
      const { data: seen } = await supabase
        .from('point_ledger').select('id')
        .eq('stripe_session_id', paymentIntentId).eq('reason', 'purchase').limit(1)
      if (seen && seen.length)
        return NextResponse.json({ error: 'This payment has already been recorded.' }, { status: 409 })
      // A purchase row with no ledger line is a sale whose points did not go
      // in. Recording it again would make a second purchase; the retry button
      // finishes the first one instead.
      const { data: had } = await supabase
        .from('purchases').select('id').eq('stripe_payment_intent_id', paymentIntentId).limit(1)
      if (had && had.length)
        return NextResponse.json({
          error: 'This payment has already been recorded, but its points may not have gone in. Do not take payment again — add them with the button below.',
          purchaseId: had[0].id,
          retryCredit: { purchaseId: had[0].id, bonusPoints: bonus, bonusNote: `Bonus on a $${dollars.toLocaleString('en-US')} desk purchase` },
        }, { status: 409 })
    } else {
      // Nothing to key on, so key on the shape of it: the same family, the same
      // amount, moments ago. Two genuinely separate cash sales of the same size
      // to the same family inside a minute is not a thing that happens at a
      // front desk -- and if it does, the message says how to proceed.
      const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString()
      const { data: recent } = await supabase
        .from('point_ledger').select('id')
        .eq('parent_id', parentId).eq('reason', 'purchase')
        .eq('amount_cents', amount)
        .gte('created_at', since)
        .limit(1)
      if (recent && recent.length)
        return NextResponse.json({
          error: 'An identical payment for this family was recorded moments ago. If that was this sale, it is already done — check their points before charging again.',
        }, { status: 409 })
    }

    const purchaseRow: Record<string, unknown> = {
      parent_id: parentId,
      lesson_package_id: null,
      amount_cents: amount,
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
      recorded_by: user.id,
    }
    if (paymentIntentId) purchaseRow.stripe_payment_intent_id = paymentIntentId

    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases').insert(purchaseRow).select().single()
    if (purchaseErr || !purchase) {
      console.error('POS purchase error:', purchaseErr)
      // Nothing was written, so sending the same sale again is safe: the
      // duplicate guards above find nothing to match.
      return NextResponse.json({
        error: 'The payment was taken but the sale was not recorded. Do not take payment again — record it again with the button below.',
        retryable: true,
      }, { status: 500 })
    }

    // The purchase and the bonus are two movements and can fail separately,
    // so each reports for itself. One try block used to cover both, and a
    // bonus that failed after the purchase landed told the desk "the points
    // did not go in" -- they were in, and adding them again paid the family
    // twice (found 2026-10-05). Both carry the purchase id in `pricing`, which
    // is what lets /api/pos/retry-credit finish the job as PURCHASED points
    // without crediting anything twice. The manual adjustment on the parent's
    // page cannot: it writes every addition as granted points, which expire.
    const points = centsToPoints(amount)
    const bonusNote = `Bonus on a $${dollars.toLocaleString('en-US')} desk purchase`
    const retryCredit = { purchaseId: purchase.id, bonusPoints: bonus, bonusNote }
    let balance = 0
    let creditError: string | null = null
    try {
      const res = await applyPoints(supabase, {
        parentId, reason: 'purchase', points,
        amountCents: amount,
        stripeSessionId: paymentIntentId || null,
        pricing: { kind: 'pos_purchase', purchaseId: purchase.id },
        actor: `admin:${admin.id}`,
        note: note ? String(note).slice(0, 300) : null,
      })
      balance = res.balance
    } catch (e: any) {
      // The money is real and recorded; the wallet is not. Say so loudly rather
      // than reporting a clean sale that left the family with nothing.
      console.error('POS points credit failed:', e)
      creditError = 'The payment was recorded but no points went in. Do not take payment again — add them with the button below.'
    }
    if (!creditError && bonus > 0) {
      try {
        const res2 = await applyPoints(supabase, {
          parentId, reason: 'admin_grant', points: bonus, toGranted: true,
          pricing: { kind: 'pos_bonus', purchaseId: purchase.id },
          actor: `admin:${admin.id}`,
          note: bonusNote,
        })
        balance = res2.balance
      } catch (e: any) {
        console.error('POS bonus grant failed:', e)
        creditError = `The payment was recorded and the ${points.toLocaleString('en-US')} purchased points are in, but the ${bonus.toLocaleString('en-US')} bonus points were not added. Do not take payment again — add the bonus with the button below.`
      }
    }

    const { data: parent } = await supabase
      .from('parents').select('first_name, last_name, email').eq('id', parentId).single()

    const label = `${points.toLocaleString('en-US')} lesson points`

    // The money is taken. A receipt that cannot be numbered must not come
    // back to the front desk as a failed sale -- the operator would take
    // payment a second time. Loud in the log, recoverable by hand, invisible
    // to the person at the counter. Written even when the points did not go
    // in: the payment happened, and the retry button only adds points.
    let invoice: any = null
    try {
      invoice = await insertInvoice(supabase, {
        parent_id: parentId,
        amount: dollars,
        payment_method: invoicePaymentLabel(paymentMethod),
        items: [
          { name: label, quantity: points, unit_price: 1 },
          ...(bonus > 0 ? [{ name: `${bonus.toLocaleString('en-US')} bonus points`, quantity: bonus, unit_price: 0 }] : []),
        ],
        status: 'sent',
        stripe_payment_intent_id: paymentIntentId || null,
        notes: note ? String(note).slice(0, 300) : null,
      })
    } catch (e: any) {
      console.error(`\u26a0\ufe0f POS sale for parent ${parentId} has no invoice:`, e?.message)
    }

    if (invoice && parent) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.mantasharkaquatics.net'
        await sendEmail({
          type: 'invoice',
          to: parent.email,
          parentName: parent.first_name,
          invoiceNumber: invoice.invoice_number,
          amount: dollars,
          planName: label,
          invoiceUrl: `${appUrl}/api/invoices/${invoice.id}/pdf`,
        })
      } catch (e) {
        console.error('Invoice email error:', e)
      }
    }

    if (creditError) {
      return NextResponse.json({
        error: creditError, purchaseId: purchase.id, invoiceId: invoice?.id, retryCredit,
      }, { status: 500 })
    }

    console.log(`✅ POS points sale: $${dollars} (+${bonus} bonus) parent=${parentId} method=${paymentMethod} invoice=${invoice?.invoice_number}`)
    return NextResponse.json({
      success: true, purchaseId: purchase.id, invoiceId: invoice?.id,
      points, bonus, balance,
    })
  } catch (err: any) {
    console.error('POS complete-sale error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
