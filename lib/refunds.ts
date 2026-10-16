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
import { applyPoints, arrears, getWallet, reversedCentsByPurchase } from '@/lib/points-wallet'
import { centsToPoints, refundableCents } from '@/lib/points'
import { alertAdmin } from '@/lib/admin-alert'

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
  /**
   * This leg's share of what Stripe kept when the payment was taken. Zero for
   * cash taken at the desk, which cost nothing; null where the payment went
   * through Stripe but its fee has not been read back yet. Prorated when only part of
   * a charge is being unwound. Stripe does not give the fee back on a refund,
   * so this is money already gone -- it is here to be shown before the button
   * is pressed, never to be added to or subtracted from what the family gets.
   */
  feeNotReturnedCents: number | null
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
  /**
   * What this refund costs the school: the original processing fees on the
   * charges being unwound, which Stripe keeps. Null legs count as zero, so
   * treat this as a floor rather than a total -- feesIncomplete says whether
   * any were missing.
   */
  feeNotReturnedCents: number
  feesIncomplete: boolean
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
 *
 * `stripe` is needed for one kind of payment: an online top-up from before
 * 2026-09-02 recorded only its checkout session, and the payment intent a
 * refund is sent to has to be asked for.
 */
export async function planRefund(
  svc: Svc,
  stripe: Stripe,
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

  const { data: purchases, error: purchasesErr } = await svc
    .from('purchases')
    .select('id, amount_cents, refunded_cents, reversed_at, paid_at, payment_method, stripe_payment_intent_id, stripe_session_id, fee_cents')
    .eq('parent_id', parentId)
    .eq('status', 'paid')
    .order('paid_at', { ascending: false })
  if (purchasesErr) throw new Error('Could not read the family\'s payments: ' + purchasesErr.message)

  // A payment taken back by the bank still has whatever the bank did not
  // take. A dispute can be for part of a payment, and reversed_at used to
  // drop the whole charge here, so the undisputed rest could never be
  // refunded (found 2026-10-15). A bank return takes all of it.
  const reversedCents = await reversedCentsByPurchase(svc, (purchases || []).filter((p: { reversed_at: string | null }) => p.reversed_at))

  // Only money that bought POINTS can come back as a points refund. The $85
  // Swim Assessment is a purchases row too (online: lib/trial-booking; at the
  // desk: pos/complete-trial-sale), and newest-first it was often the first
  // leg -- an online one has no payment intent, so the desk was told to hand
  // back $85 cash for a card payment, and refunded_cents landed on the
  // assessment while the points purchase still read unrefunded (found
  // 2026-10-07). Both assessment paths tie their payment to an is_trial
  // lesson_credits row through purchase_id, which is what marks it here.
  const purchaseIds = (purchases || []).map((p: any) => p.id)
  const assessmentPurchases = new Set<string>()
  if (purchaseIds.length > 0) {
    const { data: trialCredits, error: creditsErr } = await svc
      .from('lesson_credits').select('purchase_id')
      .eq('is_trial', true).in('purchase_id', purchaseIds)
    if (creditsErr) throw new Error('Could not read the family\'s payments: ' + creditsErr.message)
    for (const c of trialCredits || []) if (c.purchase_id) assessmentPurchases.add(c.purchase_id)
  }

  const available = (purchases || [])
    .filter((p: any) => !assessmentPurchases.has(p.id))
    .map((p: any) => ({ ...p, left: (p.amount_cents ?? 0) - (p.refunded_cents ?? 0) - (reversedCents.get(p.id) ?? 0) }))
    .filter((p: any) => p.left > 0)
    // A partly disputed payment goes last: Stripe may refuse to refund a
    // disputed charge, and refunds are taken newest first (found 2026-10-15
    // in review). The order is otherwise kept.
    .sort((a: any, b: any) => (reversedCents.has(a.id) ? 1 : 0) - (reversedCents.has(b.id) ? 1 : 0))

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
    // An online top-up from before 2026-09-02 recorded only its checkout
    // session. With no payment intent it was planned as desk cash: the desk
    // was told to hand over drawer cash for a card payment, and the card was
    // never refunded (found 2026-10-15). Money goes back the way it came, so
    // ask Stripe which payment it was; if Stripe cannot say, refuse rather
    // than guess. Only a payment with neither id was taken at the desk.
    let paymentIntentId: string | null = p.stripe_payment_intent_id || null
    if (!paymentIntentId && p.stripe_session_id) {
      const paid = p.paid_at ? ` on ${String(p.paid_at).slice(0, 10)}` : ''
      try {
        const cs = await stripe.checkout.sessions.retrieve(p.stripe_session_id)
        paymentIntentId = typeof cs.payment_intent === 'string' ? cs.payment_intent : cs.payment_intent?.id ?? null
      } catch (e) {
        console.error(`refund plan: checkout ${p.stripe_session_id} (purchase ${p.id}) not read:`, e instanceof Error ? e.message : e)
        throw new RefundNotPossible(
          'PAYMENT_LOOKUP_FAILED',
          `Could not ask Stripe how the $${((p.amount_cents ?? 0) / 100).toFixed(2)} payment${paid} was made. Try again in a minute.`,
        )
      }
      if (!paymentIntentId) {
        throw new RefundNotPossible(
          'PAYMENT_LOOKUP_FAILED',
          `Stripe has no payment for the $${((p.amount_cents ?? 0) / 100).toFixed(2)} online payment${paid} (checkout ${p.stripe_session_id}). Refund it in the Stripe dashboard instead.`,
        )
      }
    }
    // Prorated by how much of the charge is coming back. Refunding $100 of a
    // $500 payment forfeits a fifth of what that payment cost to collect.
    //
    // Three cases, and the third is the one worth separating: cash at the desk
    // cost nothing to take, so its fee is zero. A Stripe payment whose fee has
    // not been read yet is UNKNOWN, and saying zero there would quietly
    // understate what a refund costs.
    const fee = !p.stripe_payment_intent_id && !p.stripe_session_id
      ? 0
      : p.fee_cents == null || !p.amount_cents
        ? null
        : Math.round((Number(p.fee_cents) * take) / Number(p.amount_cents))
    legs.push({
      purchaseId: p.id,
      paymentIntentId,
      paymentMethod: p.payment_method || null,
      paidAt: p.paid_at || null,
      cents: take,
      priorRefundedCents: p.refunded_cents ?? 0,
      feeNotReturnedCents: fee,
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
    feeNotReturnedCents: legs.reduce((a, l) => a + (l.feeNotReturnedCents ?? 0), 0),
    // A Stripe charge whose fee was never read. Cash at the desk had no fee to
    // miss, so it does not make the figure incomplete.
    feesIncomplete: legs.some(l => l.paymentIntentId && l.feeNotReturnedCents == null),
  }
}

export type RefundLegResult = RefundLeg & {
  outcome: 'stripe_refunded' | 'hand_back' | 'failed'
  stripeRefundId?: string
  /** Stripe's own status for the refund: a card usually answers 'succeeded'
   *  at once, a bank account 'pending' for days. */
  stripeStatus?: string | null
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
  const plan = await planRefund(svc, stripe, args.parentId, args.amountCents)

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
      if (refund.status === 'failed' || refund.status === 'canceled') {
        // Refused on the spot rather than by throwing: same as a failed leg.
        legs.push({ ...leg, outcome: 'failed', stripeRefundId: refund.id, stripeStatus: refund.status, error: refund.failure_reason || `Stripe answered ${refund.status}` })
      } else {
        legs.push({ ...leg, outcome: 'stripe_refunded', stripeRefundId: refund.id, stripeStatus: refund.status })
      }
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
    //
    // A throw here used to skip recordLegs below and answer "Nothing was
    // sent" while money had gone out on the other legs -- and a desk-cash leg
    // then never reached the "cash to hand back" list (found 2026-10-15). The
    // money has moved either way, so the bookkeeping goes on and a person is
    // told to put the points back.
    try {
      await applyPoints(svc, {
        parentId: args.parentId,
        reason: 'refund_failed',
        points: centsToPoints(failedCents),
        amountCents: failedCents,
        actor: 'system',
        note: `Refund of $${(failedCents / 100).toFixed(2)} could not be delivered`,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`⚠️ refund ${ledgerId}: ${failedCents} cents were not delivered and their points were NOT put back:`, msg)
      await alertAdmin('Refund failed, points not put back', [
        `Part of a refund for parent ${args.parentId} (ledger ${ledgerId}) could not be sent: $${(failedCents / 100).toFixed(2)}.`,
        `The ${centsToPoints(failedCents)} points taken out for it could not be put back automatically (${msg}).`,
        `Put ${centsToPoints(failedCents)} PURCHASED points back in the family's wallet by hand. The rest of the refund went through.`,
      ]).catch(() => {})
    }
  }

  await recordLegs(svc, { parentId: args.parentId, ledgerId, actor: args.actor, note: args.note ?? null }, legs)

  return {
    plan,
    ledgerId,
    legs,
    deliveredCents,
    failedCents,
    handBackCents: legs.filter(l => l.outcome === 'hand_back').reduce((a, l) => a + l.cents, 0),
  }
}

/* ---- refund_legs: what each refund became (docs/migration-refund-legs.sql) ----

   One row per leg that left or still has to: a Stripe refund (pending until
   the bank says otherwise -- a bank-account refund can fail days later) or a
   desk-cash amount a person still has to hand over. The "cash to hand back"
   list on the Sales page reads the open hand_back rows; the webhook reads the
   Stripe rows when a refund fails. Legs that failed on the spot already had
   their points put back above and are not written. */

async function recordLegs(
  svc: Svc,
  ctx: { parentId: string; ledgerId: string; actor: string; note: string | null },
  legs: RefundLegResult[],
) {
  // A leg Stripe created but answered 'failed' at once is saved as failed:
  // its points were already put back here, and without the row a later
  // refund.failed webhook found nothing, inserted one and put the points back
  // a second time (found 2026-10-15 in review). A leg Stripe refused outright
  // has no refund id, so no webhook can follow; it is not saved.
  const rows = legs.filter(l => l.outcome !== 'failed' || !!l.stripeRefundId).map(l => ({
    parent_id: ctx.parentId,
    ledger_id: ctx.ledgerId,
    purchase_id: l.purchaseId,
    amount_cents: l.cents,
    kind: l.outcome === 'hand_back' ? 'hand_back' : 'stripe',
    status: l.outcome === 'failed' ? 'failed' : l.outcome === 'hand_back' ? 'to_hand_back' : l.stripeStatus === 'succeeded' ? 'succeeded' : 'pending',
    stripe_refund_id: l.stripeRefundId ?? null,
    ...(l.outcome === 'failed' ? { failure_reason: l.error ?? null } : {}),
    note: ctx.note,
    created_by: ctx.actor,
  }))
  if (rows.length === 0) return
  const { error } = await svc.from('refund_legs').insert(rows)
  if (error) {
    // The money has moved and the ledger says so; what is missing is the
    // bookkeeping row. Loud, because a desk-cash leg without one is cash
    // nobody is reminded to hand over.
    console.error('⚠️ refund_legs not written:', error.message)
    const cash = rows.filter(r => r.kind === 'hand_back').reduce((a, r) => a + r.amount_cents, 0)
    await alertAdmin('Refund made, but its record was not saved', [
      `A refund for parent ${ctx.parentId} (ledger ${ctx.ledgerId}) went through, but its details could not be saved (${error.message}).`,
      cash > 0
        ? `$${(cash / 100).toFixed(2)} of it is cash to hand back at the desk, and it will NOT appear on the "cash to hand back" list. Hand it over and note it by hand.`
        : 'Nothing is owed in cash. If a bank-account refund fails later, the points will not be put back automatically.',
    ]).catch(() => {})
  }
}

/** A desk-cash leg has been handed over. False when it was not open. */
export async function markHandedBack(svc: Svc, legId: string, actor: string): Promise<boolean> {
  const { data, error } = await svc.from('refund_legs')
    .update({ status: 'handed_back', handed_at: new Date().toISOString(), handed_by: actor })
    .eq('id', legId).eq('kind', 'hand_back').eq('status', 'to_hand_back')
    .select('id')
  if (error) throw new Error('Could not mark the cash as handed back: ' + error.message)
  return !!data && data.length > 0
}

/**
 * Stripe has changed the status of a refund the site made (refund.updated /
 * refund.failed). 'succeeded' is noted. 'failed' or 'canceled' means the money
 * never reached the family: the points come back, the charge becomes
 * refundable again, and the school is told -- once, however often Stripe
 * repeats the event. Returns what was done, for the log.
 */
export async function refundStatusChanged(svc: Svc, refund: Stripe.Refund): Promise<string> {
  const ledgerId = refund.metadata?.ledger_id
  const purchaseId = refund.metadata?.purchase_id
  const parentId = refund.metadata?.parent_id
  if (!ledgerId || !purchaseId || !parentId) return 'not a site refund'

  if (refund.status === 'succeeded') {
    await svc.from('refund_legs').update({ status: 'succeeded' })
      .eq('stripe_refund_id', refund.id).eq('status', 'pending')
    return 'succeeded'
  }
  if (refund.status !== 'failed' && refund.status !== 'canceled') return `status ${refund.status}`

  const cents = Number(refund.amount) || 0
  const why = refund.failure_reason || refund.status

  // Claim the failure exactly once. The row is normally there (written when
  // the refund was made); if that write had failed, inserting it now as
  // failed claims it the same way -- stripe_refund_id is unique.
  const { data: claimed, error: claimErr } = await svc.from('refund_legs')
    .update({ status: 'failed', failure_reason: why })
    .eq('stripe_refund_id', refund.id).in('status', ['pending', 'succeeded'])
    .select('id')
  if (claimErr) throw new Error('refund_legs claim: ' + claimErr.message)
  if (!claimed || claimed.length === 0) {
    const { data: existing } = await svc.from('refund_legs').select('id').eq('stripe_refund_id', refund.id).limit(1)
    if (existing && existing.length > 0) return 'already handled'
    const { error: insErr } = await svc.from('refund_legs').insert({
      parent_id: parentId, ledger_id: ledgerId, purchase_id: purchaseId, amount_cents: cents,
      kind: 'stripe', status: 'failed', stripe_refund_id: refund.id, failure_reason: why, created_by: 'system',
    })
    if (insErr) {
      if (/duplicate|unique/i.test(insErr.message)) return 'already handled'
      throw new Error('refund_legs insert: ' + insErr.message)
    }
  }

  // The points the refund took out go back.
  //
  // The claim above is what stops a second delivery, so a throw here must
  // give it back: a retry used to find the row already 'failed', answer
  // "already handled", and the family had neither the money nor the points,
  // with no alert (found 2026-10-15). Released, the claim is taken again by
  // Stripe's redelivery of this event (the webhook answers 503). Points come
  // before refunded_cents so the claim is the only thing to undo.
  try {
    await applyPoints(svc, {
      parentId,
      reason: 'refund_failed',
      points: centsToPoints(cents),
      amountCents: cents,
      actor: 'system',
      note: `Refund of $${(cents / 100).toFixed(2)} could not be delivered (${why})`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const { data: released, error: relErr } = await svc.from('refund_legs')
      .update({ status: 'pending', failure_reason: null })
      .eq('stripe_refund_id', refund.id).eq('status', 'failed')
      .select('id')
    const retried = !relErr && !!released && released.length > 0
    console.error(`⚠️ refund ${refund.id}: points not put back (${msg}); ${retried ? 'claim released for a retry' : 'claim NOT released'}`)
    await alertAdmin('Refund failed, points not put back yet', [
      `A refund of $${(cents / 100).toFixed(2)} for parent ${parentId} (Stripe ${refund.id}) ${refund.status === 'canceled' ? 'was cancelled' : 'failed'}: ${why}.`,
      `The ${centsToPoints(cents)} points it took out could not be put back (${msg}).`,
      retried
        ? 'The site will try again when Stripe resends the event. If no "A refund did not reach the family" alert follows within a day, put the points back by hand.'
        : `The site will NOT try again (${relErr?.message || 'the refund record could not be reopened'}). Put ${centsToPoints(cents)} PURCHASED points back in the family's wallet by hand.`,
    ]).catch(() => {})
    throw e
  }

  // The charge can be refunded again.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: p } = await svc.from('purchases').select('refunded_cents').eq('id', purchaseId).maybeSingle()
    if (!p) break
    const before = Number(p.refunded_cents) || 0
    const { data: done } = await svc.from('purchases')
      .update({ refunded_cents: Math.max(0, before - cents) })
      .eq('id', purchaseId).eq('refunded_cents', before).select('id')
    if (done && done.length > 0) break
  }

  const { data: parent } = await svc.from('parents').select('first_name, last_name, email').eq('id', parentId).maybeSingle()
  const family = parent ? `${parent.first_name || ''} ${parent.last_name || ''}`.trim() + (parent.email ? ` (${parent.email})` : '') : `parent ${parentId}`
  await alertAdmin('A refund did not reach the family', [
    `${family}: the refund of $${(cents / 100).toFixed(2)} (Stripe ${refund.id}) ${refund.status === 'canceled' ? 'was cancelled' : 'failed'}: ${why}.`,
    `The ${centsToPoints(cents)} points have been put back in the family's wallet, and that payment can be refunded again.`,
    'Contact the family to agree how to return the money (for example a new refund, or cash at the desk).',
  ]).catch(() => {})
  return 'failed: points put back'
}
