import { sendEmail } from '@/lib/email'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { centsToPoints } from '@/lib/points'
import { applyPoints } from '@/lib/points-wallet'
import { insertInvoice } from '@/lib/invoices/create'
import { checkSdpSale, invoicePaymentLabel } from '@/lib/pos/sale-checks'

// A negotiated programme sale: a set number of lessons for one named swimmer at
// a price agreed off the price list (school districts, scholarships, a family
// paying in a lump for a season).
//
// Under points this stays one sale but becomes two movements. The dollars paid
// become purchased points -- one per dollar, refundable at that rate, exactly
// like any other purchase. The gap between what was paid and what those lessons
// cost at list price becomes granted points: they spend the same way and they
// cannot be cashed out, so a discounted rate can never be turned back into more
// money than the family handed over.
//
// The points land in the FAMILY's wallet, not the swimmer's -- there is one
// wallet per family and no per-child balances. The swimmer is recorded on the
// invoice, which is where the agreement is actually documented.

export async function POST(req: NextRequest) {
  try {
    const { parentId, studentId, courseTypeId, description, sessions, unitPriceCents, paymentMethod, paymentIntentId } = await req.json()

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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // The same checks the terminal PaymentIntent was made under, so a card
    // sale that got this far passes them here too (lib/pos/sale-checks).
    const sale = await checkSdpSale(supabase, { parentId, studentId, courseTypeId, sessions, unitPriceCents })
    if (!sale.ok) return NextResponse.json({ error: sale.error }, { status: sale.status })
    const { amountCents, qty, unit, listPerLesson, student, courseType } = sale
    const noteText = String(description || '').trim()

    const paidPoints = centsToPoints(amountCents)
    const listPoints = listPerLesson * qty
    const bonusPoints = Math.max(0, listPoints - paidPoints)
    const bonusNote = `Programme rate for ${student.full_name}: ${qty} × ${courseType.name} at $${unit / 100} against a list price of ${listPerLesson}`

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
          retryCredit: { purchaseId: had[0].id, bonusPoints, bonusNote },
        }, { status: 409 })
    }

    const insertData: Record<string, unknown> = {
      parent_id: parentId,
      lesson_package_id: null,
      amount_cents: amountCents,
      status: 'paid',
      paid_at: new Date().toISOString(),
      payment_method: paymentMethod,
      recorded_by: user.id,
    }
    if (paymentIntentId) insertData.stripe_payment_intent_id = paymentIntentId

    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases').insert(insertData).select().single()
    if (purchaseErr || !purchase) {
      console.error('SDP purchase error:', purchaseErr)
      // Nothing was written, so sending the same sale again is safe.
      return NextResponse.json({
        error: 'The payment was taken but the sale was not recorded. Do not take payment again — record it again with the button below.',
        retryable: true,
      }, { status: 500 })
    }

    // Two movements, each reporting for itself, both carrying the purchase id
    // so /api/pos/retry-credit can finish whichever did not land -- as
    // PURCHASED points for the purchase, never twice. See complete-sale.
    const retryCredit = { purchaseId: purchase.id, bonusPoints, bonusNote }
    let balance = 0
    let creditError: string | null = null
    try {
      const res = await applyPoints(supabase, {
        parentId, reason: 'purchase', points: paidPoints,
        amountCents,
        stripeSessionId: paymentIntentId || null,
        pricing: { kind: 'pos_purchase', purchaseId: purchase.id },
        actor: `admin:${admin.id}`,
        note: `${qty} × ${courseType.name} for ${student.full_name}${noteText ? ` — ${noteText}` : ''}`,
      })
      balance = res.balance
    } catch (e: any) {
      console.error('SDP points credit failed:', e)
      creditError = 'The payment was recorded but no points went in. Do not take payment again — add them with the button below.'
    }
    if (!creditError && bonusPoints > 0) {
      try {
        const res2 = await applyPoints(supabase, {
          parentId, reason: 'admin_grant', points: bonusPoints, toGranted: true,
          pricing: { kind: 'pos_bonus', purchaseId: purchase.id },
          actor: `admin:${admin.id}`,
          note: bonusNote,
        })
        balance = res2.balance
      } catch (e: any) {
        console.error('SDP programme-rate grant failed:', e)
        creditError = `The payment was recorded and the ${paidPoints.toLocaleString('en-US')} purchased points are in, but the ${bonusPoints.toLocaleString('en-US')} programme-rate points were not added. Do not take payment again — add them with the button below.`
      }
    }

    const { data: parent } = await supabase
      .from('parents').select('first_name, last_name, email').eq('id', parentId).single()

    // The money is taken. A receipt that cannot be numbered must not come
    // back to the front desk as a failed sale -- the operator would take
    // payment a second time. Loud in the log, recoverable by hand, invisible
    // to the person at the counter. Written even when the points did not go
    // in: the payment happened, and the retry button only adds points.
    let invoice: any = null
    try {
      invoice = await insertInvoice(supabase, {
        parent_id: parentId,
        student_id: studentId,
        amount: amountCents / 100,
        payment_method: invoicePaymentLabel(paymentMethod),
        items: [
          { name: `${courseType.name} — ${student.full_name}`, quantity: qty, unit_price: unit / 100 },
          ...(bonusPoints > 0
            ? [{ name: `${bonusPoints.toLocaleString('en-US')} programme-rate points`, quantity: bonusPoints, unit_price: 0 }]
            : []),
        ],
        status: 'sent',
        stripe_payment_intent_id: paymentIntentId || null,
        notes: noteText || null,
      })
    } catch (e: any) {
      console.error(`\u26a0\ufe0f POS SDP sale for parent ${parentId} has no invoice:`, e?.message)
    }

    if (invoice && parent) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.mantasharkaquatics.net'
        await sendEmail({
          type: 'invoice',
          to: parent.email,
          parentName: parent.first_name,
          invoiceNumber: invoice.invoice_number,
          amount: amountCents / 100,
          planName: `${courseType.name} (${qty} lessons)`,
          invoiceUrl: `${appUrl}/api/invoices/${invoice.id}/pdf`,
        })
      } catch (e) {
        console.error('SDP invoice email error:', e)
      }
    }

    if (creditError) {
      return NextResponse.json({
        error: creditError, purchaseId: purchase.id, invoiceId: invoice?.id, retryCredit,
      }, { status: 500 })
    }

    console.log(`✅ SDP sale: "${courseType.name}" x${qty} student=${studentId} points=${paidPoints}+${bonusPoints} invoice=${invoice?.invoice_number}`)
    return NextResponse.json({
      success: true, purchaseId: purchase.id, invoiceId: invoice?.id,
      points: paidPoints, bonus: bonusPoints, balance,
    })
  } catch (err: any) {
    console.error('SDP complete-sale error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
