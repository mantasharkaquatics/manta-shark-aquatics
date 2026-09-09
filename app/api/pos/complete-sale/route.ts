import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { centsToPoints, MIN_TOPUP_DOLLARS, MAX_TOPUP_DOLLARS } from '@/lib/points'
import { applyPoints } from '@/lib/points-wallet'
import { insertInvoice } from '@/lib/invoices/create'

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

    if (!parentId) return NextResponse.json({ error: 'parentId required' }, { status: 400 })
    const amount = Math.round(Number(amountCents))
    if (!Number.isFinite(amount) || amount % 100 !== 0)
      return NextResponse.json({ error: 'Amount must be a whole number of dollars' }, { status: 400 })
    const dollars = amount / 100
    if (dollars < MIN_TOPUP_DOLLARS || dollars > MAX_TOPUP_DOLLARS)
      return NextResponse.json({ error: `Amount must be between $${MIN_TOPUP_DOLLARS} and $${MAX_TOPUP_DOLLARS}` }, { status: 400 })
    const bonus = Math.round(Number(bonusPoints || 0))
    if (!Number.isFinite(bonus) || bonus < 0 || bonus > dollars)
      return NextResponse.json({ error: 'Bonus points must be between 0 and the amount paid' }, { status: 400 })

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
      return NextResponse.json({ error: 'Purchase failed' }, { status: 500 })
    }

    const points = centsToPoints(amount)
    let balance = 0
    try {
      const res = await applyPoints(supabase, {
        parentId, reason: 'purchase', points,
        amountCents: amount,
        stripeSessionId: paymentIntentId || null,
        actor: `admin:${admin.id}`,
        note: note ? String(note).slice(0, 300) : null,
      })
      balance = res.balance
      if (bonus > 0) {
        const res2 = await applyPoints(supabase, {
          parentId, reason: 'admin_grant', points: bonus, toGranted: true,
          actor: `admin:${admin.id}`,
          note: `Bonus on a $${dollars.toLocaleString('en-US')} desk purchase`,
        })
        balance = res2.balance
      }
    } catch (e: any) {
      // The money is real and recorded; the wallet is not. Say so loudly rather
      // than reporting a clean sale that left the family with nothing.
      console.error('POS points credit failed:', e)
      return NextResponse.json({
        error: 'The payment was recorded but the points did not go in. Do not take payment again — add the points by hand from the parent\'s page.',
      }, { status: 500 })
    }

    const { data: parent } = await supabase
      .from('parents').select('first_name, last_name, email').eq('id', parentId).single()

    const label = `${points.toLocaleString('en-US')} lesson points`

    // The money is taken and the points are in the wallet. A receipt that
    // cannot be numbered must not come back to the front desk as a failed
    // sale -- the operator would take payment a second time. Loud in the log,
    // recoverable by hand, invisible to the person at the counter.
    let invoice: any = null
    try {
      invoice = await insertInvoice(supabase, {
        parent_id: parentId,
        amount: dollars,
        payment_method: paymentMethod === 'stripe_terminal' ? 'Credit Card (Terminal)' : paymentMethod,
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
