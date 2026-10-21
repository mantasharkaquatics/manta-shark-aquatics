import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin } from '@/lib/api-auth'
import { CASH_REFUND_ENABLED } from '@/lib/points'
import { executeRefund, planRefund, RefundNotPossible } from '@/lib/refunds'
import { sendEmail } from '@/lib/email'
import { adminRole } from '@/lib/staff-accounts'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// Refunding purchased points.
//
// Owner only (owner, 2026-10-14): not something a manager or a parent sets off.
// The amount depends on which original charges are still refundable, some of
// it may be desk cash a person has to hand over, and none of that is a
// decision for a self-service button. Money goes back the way it came
// (owner, 2026-10-14): card and bank payments through Stripe to the original
// method, desk cash in cash.
//
// GET  ?probe=1              { owner, enabled } -- whether to show the button
// GET  ?parent_id=&amount=   what this refund would consist of (works while the
//                            switch is off, so the screen can be checked)
// POST { parent_id, amount, note }   do it -- only once CASH_REFUND_ENABLED
//
// CASH_REFUND_ENABLED stays false until the refund policy has been through a
// lawyer: refunding against terms nobody has approved is worse than waiting.

async function ownerOnly() {
  const auth = await requireAdmin()
  if (!auth) return { res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if ((await adminRole(auth.svc, auth.admin.id)) !== 'super_admin')
    return { res: NextResponse.json({ error: 'Only the owner can refund', code: 'not_owner' }, { status: 403 }) }
  return { auth }
}

function failed(e: unknown) {
  if (e instanceof RefundNotPossible)
    return NextResponse.json({ error: e.code, message: e.message }, { status: 400 })
  console.error('refund error:', e)
  return NextResponse.json({ error: 'Refund failed. Nothing was sent.' }, { status: 500 })
}

/** How each Stripe leg was paid -- card, bank account, desk card reader --
 *  so the preview can say where the money will land. Best effort. */
async function paidWith(paymentIntentId: string): Promise<string | null> {
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] })
    // Cast: the field is there (expanded above); this project's type check
    // resolves a narrower PaymentIntent type, as elsewhere in the repo.
    const charge = (pi as any).latest_charge as Stripe.Charge | null
    return charge?.payment_method_details?.type || (pi as any).payment_method_types?.[0] || null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const o = await ownerOnly()
  if (o.res) return o.res
  const { auth } = o

  if (req.nextUrl.searchParams.get('probe')) {
    return NextResponse.json({ owner: true, enabled: CASH_REFUND_ENABLED })
  }

  const parentId = req.nextUrl.searchParams.get('parent_id')
  if (!parentId) return NextResponse.json({ error: 'parent_id required' }, { status: 400 })
  const raw = req.nextUrl.searchParams.get('amount')
  const dollars = raw == null || raw === '' ? null : Number(raw)
  if (dollars != null && !Number.isFinite(dollars))
    return NextResponse.json({ error: 'INVALID_AMOUNT', message: 'Not a number.' }, { status: 400 })

  try {
    const plan = await planRefund(auth.svc, stripe, parentId, dollars == null ? null : Math.round(dollars * 100))
    // plan.feeNotReturnedCents is what this refund costs the school: Stripe
    // keeps the processing fee from the original payment whatever happens here.
    // It comes from each charge's own balance transaction, so it is what was
    // actually paid rather than a rate multiplied out -- and where a fee has
    // not been read yet, feesIncomplete says so instead of the figure quietly
    // reading low.
    const legs = await Promise.all(plan.legs.map(async l => ({
      ...l,
      paidWith: l.paymentIntentId ? await paidWith(l.paymentIntentId) : (l.paymentMethod || 'cash'),
    })))
    return NextResponse.json({ ...plan, legs, enabled: CASH_REFUND_ENABLED })
  } catch (e) {
    return failed(e)
  }
}

export async function POST(req: NextRequest) {
  const o = await ownerOnly()
  if (o.res) return o.res
  const { auth } = o
  if (!CASH_REFUND_ENABLED) {
    return NextResponse.json({ error: 'REFUNDS_NOT_ENABLED', message: 'Refunds open once the terms have been reviewed.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { parent_id, amount, note } = body
  if (!parent_id) return NextResponse.json({ error: 'parent_id required' }, { status: 400 })
  if (!note || !String(note).trim())
    return NextResponse.json({ error: 'A refund needs a reason. The family sees it on their statement.' }, { status: 400 })

  const dollars = amount == null || amount === '' ? null : Number(amount)
  if (dollars != null && (!Number.isFinite(dollars) || dollars <= 0))
    return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 })

  let result
  try {
    result = await executeRefund(auth.svc, stripe, {
      parentId: parent_id,
      amountCents: dollars == null ? null : Math.round(dollars * 100),
      actor: `admin:${auth.admin.id}`,
      note: String(note).trim(),
    })
  } catch (e) {
    return failed(e)
  }

  // Tell the family what left and what is coming. Best effort: the money has
  // moved and the ledger says so, and a mail failure must not read as a failed
  // refund to whoever pressed the button.
  try {
    const { data: parentRow } = await auth.svc
      .from('parents').select('first_name, email').eq('id', parent_id).single()
    if (parentRow?.email && result.deliveredCents > 0) {
      await sendEmail({
        type: 'refund_issued',
        to: parentRow.email,
        parentName: parentRow.first_name || 'there',
        amount: result.deliveredCents / 100,
        handBackAmount: result.handBackCents / 100,
        zelleBackAmount: result.zelleBackCents / 100,
      })
    }
  } catch (e) {
    console.error('refund notice failed:', e)
  }

  return NextResponse.json({
    ok: true,
    refunded: result.deliveredCents / 100,
    handBack: result.handBackCents / 100,
    zelleBack: result.zelleBackCents / 100,
    failed: result.failedCents / 100,
    legs: result.legs.map(l => ({
      purchase_id: l.purchaseId,
      paid_at: l.paidAt,
      amount: l.cents / 100,
      outcome: l.outcome,
      stripe_refund_id: l.stripeRefundId ?? null,
      error: l.error ?? null,
    })),
  })
}
