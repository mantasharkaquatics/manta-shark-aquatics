// Giving a family their money back.
//
// The constraint that shapes all of this: Stripe sends a refund to the ORIGINAL
// payment method and nowhere else. So "refund $650" is never one action. It is
// "which charges are we unwinding, and for how much each" -- maybe a $400 card
// payment from March plus $250 of a $500 one from June, maybe a card charge
// plus cash taken at the front desk that only a human can hand back.
//
// Two numbers therefore bound a refund, and they are not the same number:
//
//   the wallet   how many purchased points are left  (granted points are ours,
//                and never become cash -- see point_wallets.balance_granted)
//   the charges  what the original payments can still give back
//
// A family who bought 650 points and swam 500 of them has $150 of wallet left
// against $650 of charges. A family who was given 200 courtesy points and never
// paid has the reverse. The refundable figure is the lower of the two.
//
// Order of operations, which is the part worth getting right: points come out
// FIRST, then the money goes. Reversed, a delivered refund whose point
// deduction failed leaves the family holding both the cash and the lessons,
// with nothing on any screen saying so. This way round the bad case is "points
// gone, money not sent", which is visible, and which the refund_failed ledger
// reason puts back.

import Stripe from 'stripe'
import { applyPoints, arrears, getWallet } from '@/lib/points-wallet'
import { centsToPoints, refundableCents } from '@/lib/points'

type Svc = any

export class RefundNotPossible extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'RefundNotPossible'
  }
}

/** One original charge, and how much of this refund comes out of it. */
export type RefundLeg = {
  purchaseId: string
  /** null means it was taken at the front desk: cash or a cheque, handed back by a person. */
  paymentIntentId: string | null
  paymentMethod: string | null
  paidAt: string | null
  cents: number
  /** refunded_cents as it was read, so the write can be guarded on it. */
  priorRefundedCents: number
}

export type RefundPlan = {
  /** Purchased points left in the wallet, in cents. */
  walletRefundableCents: number
  /** What the original charges can still give back, in cents. */
  chargesRefundableCents: number
  /** The lower of the two: the most that can be refunded today. */
  maxRefundCents: number
  requestedCents: number
  legs: RefundLeg[]
  /** Of the requested amount, how much Stripe can send back. */
  stripeCents: number
  /** ...and how much has to be handed over by a person. */
  manualCents: number
}

/**
 * What a refund of `requestedCents` would actually consist of. Pass null for
 * the largest refund currently possible.
 *
 * Charges are taken newest first. An older card is likelier to have expired,
 * and an expired card is where refunds go wrong -- the issuer usually forwards
 * the money to a replacement card, but "usually" is doing real work in that
 * sentence. Unwinding the recent money first leaves the awkward charges in the
 * wallet rather than in a refund that has to be chased.
 */
export async function planRefund(
  svc: Svc,
  parentId: string,
  requestedCents: number | null,
): Promise<RefundPlan> {
  const wallet = await getWallet(svc, parentId)
  if (arrears(wallet) > 0) {
    throw new RefundNotPossible(
      'WALLET_IN_ARREARS',
      `This family owes ${arrears(wallet)} points from a payment that came back. Settle that before refunding.`,
    )
  }

  const walletRefundableCents = refundableCents(wallet.balance_purchased)

  const { data: purchases } = await svc
    .from('purchases')
    .select('id, amount_cents, refunded_cents, paid_at, payment_method, stripe_payment_intent_id')
    .eq('parent_id', parentId)
    .eq('status', 'paid')
    .is('reversed_at', null)
    .order('paid_at', { ascending: false })

  const available = (purchases || [])
    .map((p: any) => ({ ...p, left: (p.amount_cents ?? 0) - (p.refunded_cents ?? 0) }))
    .filter((p: any) => p.left > 0)

  const chargesRefundableCents = available.reduce((a: number, p: any) => a + p.left, 0)
  const maxRefundCents = Math.min(walletRefundableCents, chargesRefundableCents)

  const requested = requestedCents ?? maxRefundCents
  if (!Number.isInteger(requested) || requested <= 0)
    throw new RefundNotPossible('INVALID_AMOUNT', 'A refund has to be a positive whole number of cents.')
  // Points are whole dollars, so a refund that is not a whole number of dollars
  // could not be taken out of the wallet without inventing a fraction of one.
  if (requested % 100 !== 0)
    throw new RefundNotPossible('INVALID_AMOUNT', 'Refunds are in whole dollars.')
  if (requested > maxRefundCents)
    throw new RefundNotPossible(
      'ABOVE_REFUNDABLE',
      `The most that can be refunded is $${(maxRefundCents / 100).toFixed(2)}.`,
    )

  const legs: RefundLeg[] = []
  let remaining = requested
  for (const p of available) {
    if (remaining <= 0) break
    const take = Math.min(p.left, remaining)
    legs.push({
      purchaseId: p.id,
      paymentIntentId: p.stripe_payment_intent_id || null,
      paymentMethod: p.payment_method || null,
      paidAt: p.paid_at || null,
      cents: take,
      priorRefundedCents: p.refunded_cents ?? 0,
    })
    remaining -= take
  }

  return {
    walletRefundableCents,
    chargesRefundableCents,
    maxRefundCents,
    requestedCents: requested,
    legs,
    stripeCents: legs.filter(l => l.paymentIntentId).reduce((a, l) => a + l.cents, 0),
    manualCents: legs.filter(l => !l.paymentIntentId).reduce((a, l) => a + l.cents, 0),
  }
}

export type RefundLegResult = RefundLeg & {
  outcome: 'stripe_refunded' | 'hand_back' | 'failed'
  stripeRefundId?: string
  error?: string
}

export type RefundResult = {
  plan: RefundPlan
  ledgerId: string
  legs: RefundLegResult[]
  /** Cents that actually left, Stripe and front desk together. */
  deliveredCents: number
  /** Cents that could not be sent, and whose points went back to the family. */
  failedCents: number
  /** Cents a person still has to hand over. Not a failure -- just not automatic. */
  handBackCents: number
}

/**
 * Take the points out and send the money back.
 *
 * Idempotent per charge: each Stripe refund is keyed on the ledger entry that
 * paid for it, so a retried request cannot refund the same charge twice.
 * Partial failure is expected rather than exceptional -- a two-year-old card
 * may be gone while a recent one is fine -- so each leg stands on its own and
 * only the points behind the failed legs go back.
 */
export async function executeRefund(
  svc: Svc,
  stripe: Stripe,
  args: { parentId: string; amountCents: number | null; actor: string; note?: string | null },
): Promise<RefundResult> {
  const plan = await planRefund(svc, args.parentId, args.amountCents)

  // Points first. See the note at the top of this file.
  const { ledgerId } = await applyPoints(svc, {
    parentId: args.parentId,
    reason: 'cash_refund',
    points: -centsToPoints(plan.requestedCents),
    amountCents: plan.requestedCents,
    actor: args.actor,
    note: args.note ?? null,
  })

  const legs: RefundLegResult[] = []
  for (const leg of plan.legs) {
    if (!leg.paymentIntentId) {
      // Taken at the front desk. Nothing to call; a person hands it over, and
      // the books say so either way.
      legs.push({ ...leg, outcome: 'hand_back' })
      continue
    }
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: leg.paymentIntentId,
          amount: leg.cents,
          metadata: { parent_id: args.parentId, ledger_id: ledgerId, purchase_id: leg.purchaseId },
        },
        // Keyed on the ledger entry that paid for it: a retried request finds
        // the refund Stripe already made instead of making a second one.
        { idempotencyKey: `msa-refund:${ledgerId}:${leg.purchaseId}` },
      )
      legs.push({ ...leg, outcome: 'stripe_refunded', stripeRefundId: refund.id })
    } catch (e: any) {
      console.error(`refund leg failed: purchase=${leg.purchaseId} pi=${leg.paymentIntentId}:`, e?.message)
      legs.push({ ...leg, outcome: 'failed', error: e?.message || 'Stripe refused the refund' })
    }
  }

  const delivered = legs.filter(l => l.outcome !== 'failed')
  const deliveredCents = delivered.reduce((a, l) => a + l.cents, 0)
  const failedCents = plan.requestedCents - deliveredCents

  // Only what actually left. A leg Stripe refused was never refunded, and the
  // charge behind it must stay refundable.
  for (const leg of delivered) {
    const { data: stamped } = await svc
      .from('purchases')
      .update({ refunded_cents: leg.priorRefundedCents + leg.cents })
      .eq('id', leg.purchaseId)
      .eq('refunded_cents', leg.priorRefundedCents)
      .select('id')
    if (!stamped || stamped.length === 0) {
      console.error(
        `⚠️ purchase ${leg.purchaseId}: ${leg.cents} cents were refunded but refunded_cents moved ` +
        `underneath the stamp (expected ${leg.priorRefundedCents}). Check for a double refund.`
      )
    }
  }

  if (failedCents > 0) {
    // Put back exactly the part that did not go, and unwind its share of the
    // running total with it.
    await applyPoints(svc, {
      parentId: args.parentId,
      reason: 'refund_failed',
      points: centsToPoints(failedCents),
      amountCents: failedCents,
      actor: 'system',
      note: `Refund of $${(failedCents / 100).toFixed(2)} could not be delivered`,
    })
  }

  return {
    plan,
    ledgerId,
    legs,
    deliveredCents,
    failedCents,
    handBackCents: legs.filter(l => l.outcome === 'hand_back').reduce((a, l) => a + l.cents, 0),
  }
}
