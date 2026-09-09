// What a payment actually cost us.
//
// Take $650 and Stripe keeps roughly $19; $631 reaches the balance. That $19
// only ever existed in the Stripe Dashboard, so "what did we net this month"
// meant opening two windows and reconciling by eye.
//
// The figure is ASKED FOR, never calculated. Multiplying by a published rate
// gets it wrong in more ways than it gets it right: ACH is capped at $5, cards
// carry extra for international ones, Terminal is priced differently again, and
// promotional rates come and go. Every charge has a balance transaction and it
// states the fee and the net. That is the number.
//
// Nothing here is load-bearing for a payment: a fee that could not be read
// leaves fee_captured_at null, the row waits for the backfill, and the money
// side of the system never notices.

import Stripe from 'stripe'

type Svc = any

export type FeeCapture = {
  purchaseId: string
  ok: boolean
  feeCents?: number
  netCents?: number
  reason?: string
}

/**
 * Read one payment's fee from Stripe and write it onto its purchase row.
 *
 * ACH is the reason this can legitimately find nothing: the balance
 * transaction does not exist until the payment settles, two to four business
 * days after the points were handed out. That is not an error -- the row stays
 * uncaptured and the backfill picks it up later.
 */
export async function captureFee(
  stripe: Stripe,
  svc: Svc,
  purchase: {
    id: string
    stripe_payment_intent_id?: string | null
    stripe_session_id?: string | null
  },
): Promise<FeeCapture> {
  let paymentIntentId = purchase.stripe_payment_intent_id || null

  // Older rows -- the Swim Assessment ones especially -- recorded the checkout
  // session and not the payment intent. One extra call rather than a schema
  // migration for history.
  if (!paymentIntentId && purchase.stripe_session_id) {
    try {
      const cs = await stripe.checkout.sessions.retrieve(purchase.stripe_session_id)
      paymentIntentId = typeof cs.payment_intent === 'string'
        ? cs.payment_intent
        : (cs.payment_intent as any)?.id ?? null
    } catch (e: any) {
      return { purchaseId: purchase.id, ok: false, reason: `session lookup failed: ${e?.message}` }
    }
  }
  if (!paymentIntentId) {
    return { purchaseId: purchase.id, ok: false, reason: 'not a Stripe payment' }
  }

  let fee: number | null = null
  let net: number | null = null
  let currency: string | null = null
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    })
    const charge = (pi as any).latest_charge
    const bt = charge && typeof charge === 'object' ? charge.balance_transaction : null
    if (bt && typeof bt === 'object') {
      fee = Number(bt.fee)
      net = Number(bt.net)
      currency = bt.currency || null
    }
  } catch (e: any) {
    return { purchaseId: purchase.id, ok: false, reason: `stripe: ${e?.message}` }
  }

  if (fee == null || !Number.isFinite(fee)) {
    // Still settling (ACH), or the charge has not posted. Try again later.
    return { purchaseId: purchase.id, ok: false, reason: 'no balance transaction yet' }
  }

  const { error } = await svc
    .from('purchases')
    .update({
      fee_cents: fee,
      net_cents: net,
      fee_currency: currency,
      fee_captured_at: new Date().toISOString(),
      // Backfilling an old row should not invent a payment intent it never had.
      ...(purchase.stripe_payment_intent_id ? {} : { stripe_payment_intent_id: paymentIntentId }),
    })
    .eq('id', purchase.id)
  if (error) return { purchaseId: purchase.id, ok: false, reason: `write failed: ${error.message}` }

  return { purchaseId: purchase.id, ok: true, feeCents: fee, netCents: net ?? undefined }
}

/**
 * Fill in every purchase still missing its fee, oldest first.
 *
 * Run after a deploy to catch history, and on a schedule to catch ACH payments
 * that had not settled when they were first seen. Bounded per call so it can
 * never turn into a long-running request against the Stripe API.
 */
export async function backfillFees(
  stripe: Stripe,
  svc: Svc,
  limit = 100,
): Promise<{ attempted: number; captured: number; feeCentsCaptured: number; skipped: FeeCapture[] }> {
  const { data: rows, error } = await svc
    .from('purchases')
    .select('id, stripe_payment_intent_id, stripe_session_id')
    .is('fee_captured_at', null)
    .not('stripe_payment_intent_id', 'is', null)
    .order('paid_at', { ascending: true })
    .limit(limit)
  // Say so. A failed query returns no rows, and treating that as "nothing left
  // to do" reported success on a database where the fee columns did not exist
  // yet -- the one moment this is guaranteed to have work to do.
  if (error) throw new Error(`Could not read purchases: ${error.message}`)

  let captured = 0
  let feeCentsCaptured = 0
  const skipped: FeeCapture[] = []
  for (const row of rows || []) {
    const res = await captureFee(stripe, svc, row)
    if (res.ok) { captured++; feeCentsCaptured += res.feeCents ?? 0 }
    else skipped.push(res)
  }
  return { attempted: (rows || []).length, captured, feeCentsCaptured, skipped }
}
