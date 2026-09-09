import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin } from '@/lib/api-auth'
import { CASH_REFUND_ENABLED } from '@/lib/points'
import { executeRefund, planRefund, RefundNotPossible } from '@/lib/refunds'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// Refunding purchased points as cash.
//
// Admin only, and deliberately not something a parent can set off themselves:
// the amount depends on which original charges are still refundable, some of it
// may be cash that a person has to hand over, and none of that is a decision to
// make from a self-service button.
//
// GET  ?parent_id=&amount=   what this refund would consist of, and what it can't cover
// POST { parent_id, amount, note }   do it
//
// Held behind CASH_REFUND_ENABLED until the refund policy has been through a
// lawyer. The route is finished and tested; what is not finished is the wording
// the family agrees to, and shipping the button first would mean refunding
// against terms nobody has approved.

function guard() {
  if (!CASH_REFUND_ENABLED) {
    return NextResponse.json({ error: 'REFUNDS_NOT_ENABLED' }, { status: 403 })
  }
  return null
}

function failed(e: unknown) {
  if (e instanceof RefundNotPossible)
    return NextResponse.json({ error: e.code, message: e.message }, { status: 400 })
  console.error('refund error:', e)
  return NextResponse.json({ error: 'Refund failed. Nothing was sent.' }, { status: 500 })
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const off = guard(); if (off) return off

  const parentId = req.nextUrl.searchParams.get('parent_id')
  if (!parentId) return NextResponse.json({ error: 'parent_id required' }, { status: 400 })
  const raw = req.nextUrl.searchParams.get('amount')
  const dollars = raw == null || raw === '' ? null : Number(raw)
  if (dollars != null && !Number.isFinite(dollars))
    return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 })

  try {
    const plan = await planRefund(auth.svc, parentId, dollars == null ? null : Math.round(dollars * 100))
    // plan.feeNotReturnedCents is what this refund costs the school: Stripe
    // keeps the processing fee from the original payment whatever happens here.
    // It comes from each charge's own balance transaction, so it is what was
    // actually paid rather than a rate multiplied out -- and where a fee has
    // not been read yet, feesIncomplete says so instead of the figure quietly
    // reading low.
    return NextResponse.json(plan)
  } catch (e) {
    return failed(e)
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const off = guard(); if (off) return off

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
      })
    }
  } catch (e) {
    console.error('refund notice failed:', e)
  }

  return NextResponse.json({
    ok: true,
    refunded: result.deliveredCents / 100,
    handBack: result.handBackCents / 100,
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
