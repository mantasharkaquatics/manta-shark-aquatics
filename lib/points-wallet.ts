// Every movement of points goes through this module. Nothing else writes to
// point_wallets or point_ledger.
//
// The invariant this file exists to hold: the balance and the ledger can never
// disagree. Each function reads the wallet, computes the new balances, and
// writes both under a guard -- the update names the balances it expects to
// find, so two requests racing for the same wallet cannot both succeed from the
// same starting figure. The loser retries and sees the winner's balance.
//
// Points are money. Nothing here is reachable from the browser: every function
// takes a service-role client.

import {
  centsToPoints,
  forgivenessAvailable,
  LESSONS_PER_FORGIVENESS,
  nextVipTier,
  vipTier,
  type PriceBreakdown,
} from '@/lib/points'

type Svc = any

export type Wallet = {
  id: string
  parent_id: string
  balance_purchased: number
  balance_granted: number
  total_paid_cents: number
  total_refunded_cents: number
  forgiveness_used: number
}

export type LedgerReason =
  | 'purchase' | 'booking' | 'booking_failed' | 'cancel_refund' | 'forgiveness'
  | 'school_cancel' | 'admin_grant' | 'admin_deduct' | 'cash_refund'
  | 'refund_failed' | 'payment_failed' | 'chargeback'

/** The two ways a payment we already credited turns out not to have been paid. */
export const REVERSAL_REASONS = ['payment_failed', 'chargeback'] as const
export type ReversalReason = (typeof REVERSAL_REASONS)[number]

const MAX_ATTEMPTS = 4

const isReversal = (r: LedgerReason): r is ReversalReason =>
  (REVERSAL_REASONS as readonly string[]).includes(r)

export class InsufficientPoints extends Error {
  constructor(public needed: number, public available: number) {
    super('NOT_ENOUGH_POINTS')
    this.name = 'InsufficientPoints'
  }
}

/**
 * The family owes us points, so nothing may be spent until that is settled.
 *
 * Distinct from InsufficientPoints on purpose: "you need more points" and
 * "your last payment came back" call for different words and a different
 * button, and a wallet in arrears can still show a positive total if it holds
 * granted points.
 */
export class WalletInArrears extends Error {
  constructor(public owed: number) {
    super('WALLET_IN_ARREARS')
    this.name = 'WalletInArrears'
  }
}

/**
 * The ledger already holds this movement, so this attempt wrote nothing.
 *
 * Raised when the unique index on point_ledger rejects the insert -- today
 * that is one purchase per Stripe session. Two webhook deliveries for the
 * same payment can both pass purchaseAlreadyCredited (neither has written
 * yet) and both reach the wallet; the index is what actually stops the
 * second one, and this is how the caller hears about it. It means "already
 * done", not "failed": a webhook that catches this should answer 200.
 */
export class DuplicateLedgerEntry extends Error {
  constructor(public reason: LedgerReason, public stripeSessionId: string | null) {
    super('LEDGER_DUPLICATE')
    this.name = 'DuplicateLedgerEntry'
  }
}

/** The family's wallet, opened on first sight. Exactly one per family. */
export async function getWallet(svc: Svc, parentId: string): Promise<Wallet> {
  const { data } = await svc.from('point_wallets').select('*').eq('parent_id', parentId).maybeSingle()
  if (data) return data as Wallet

  // upsert, not insert: two first-time requests can arrive together.
  const { data: made, error } = await svc
    .from('point_wallets')
    .upsert({ parent_id: parentId }, { onConflict: 'parent_id' })
    .select('*')
    .single()
  if (error) throw new Error(`Could not open a points wallet: ${error.message}`)
  return made as Wallet
}

/** The balance as a parent sees it: one number. */
export const totalBalance = (w: Wallet) => w.balance_purchased + w.balance_granted

/**
 * Completed lessons, from the database function rather than a stored counter.
 * It drives the VIP tier and the forgiveness count, so it must not be cached
 * anywhere it could go stale.
 *
 * A lesson counts once its date has passed, it was not cancelled, and its
 * points were not handed back. A no-show counts -- the coach was there. The
 * Swim Assessment counts too, even though it is paid by card rather than from
 * the wallet, because a parent counting the lessons they have taken counts it.
 */
export async function lessonsCompleted(svc: Svc, parentId: string): Promise<number> {
  const { data, error } = await svc.rpc('points_lessons_completed', { p_parent_id: parentId })
  if (error) throw new Error(`Could not count completed lessons: ${error.message}`)
  return Number(data) || 0
}

/** Everything the booking page and the dashboard need, in one round trip. */
export async function walletSummary(svc: Svc, parentId: string) {
  const wallet = await getWallet(svc, parentId)
  const completed = await lessonsCompleted(svc, parentId)
  const tier = vipTier(completed)
  const next = nextVipTier(completed)
  return {
    balance: totalBalance(wallet),
    balancePurchased: wallet.balance_purchased,
    balanceGranted: wallet.balance_granted,
    // Non-zero only after a bank return or a dispute clawed points back out.
    arrears: arrears(wallet),
    lessonsCompleted: completed,
    vipLevel: tier.level,
    vipDiscount: tier.discount,
    nextTier: next && {
      level: next.tier.level,
      discount: next.tier.discount,
      lessonsToGo: next.lessonsToGo,
    },
    forgiveness: forgivenessAvailable(completed, wallet.forgiveness_used),
    lessonsPerForgiveness: LESSONS_PER_FORGIVENESS,
  }
}

type ApplyInput = {
  parentId: string
  reason: LedgerReason
  /** Positive adds, negative spends. Granted points are spent first. */
  points: number
  /** Only admin_grant sets this: granted points are never refundable for cash. */
  toGranted?: boolean
  bookingId?: string | null
  amountCents?: number | null
  stripeSessionId?: string | null
  pricing?: PriceBreakdown | Record<string, unknown> | null
  note?: string | null
  actor: string
  /** forgiveness only: also burns one of the family's allowances. */
  consumeForgiveness?: boolean
  /**
   * Reversals only. Takes the points straight back out of the purchased
   * bucket and lets the balance go below zero, because by the time a bank
   * return arrives the family may already have swum the lessons. A negative
   * balance is a debt: booking is blocked until it is paid off.
   */
  allowNegative?: boolean
}

export type ApplyResult = { wallet: Wallet; ledgerId: string; balance: number }

/**
 * The single write path.
 *
 * Spending draws on granted points before purchased ones. A family given 50
 * courtesy points should spend those first -- and it means a later cash refund
 * can only ever reach points they actually paid for.
 */
export async function applyPoints(svc: Svc, input: ApplyInput): Promise<ApplyResult> {
  if (!Number.isInteger(input.points)) throw new Error('Points must be a whole number')
  if (input.points === 0) throw new Error('Refusing to write a zero-point ledger entry')
  if ((input.reason === 'admin_grant' || input.reason === 'admin_deduct') && !input.note?.trim()) {
    throw new Error('A manual points adjustment needs a reason')
  }

  let last = ''
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const wallet = await getWallet(svc, input.parentId)

    let dGranted = 0
    let dPurchased = 0

    if (input.points > 0) {
      if (input.toGranted) dGranted = input.points
      else dPurchased = input.points
    } else if (input.allowNegative) {
      // A reversal undoes one specific purchase, so it comes out of the bucket
      // that purchase went into and nowhere else. Granted points were a gift
      // from us and are never clawed back to settle someone else's bank return.
      dPurchased = input.points
    } else {
      const owed = -input.points
      // Owing us money stops every spend, granted points included. This is
      // the leverage that actually settles a returned bank payment.
      if (wallet.balance_purchased < 0) throw new WalletInArrears(-wallet.balance_purchased)
      if (totalBalance(wallet) < owed) throw new InsufficientPoints(owed, totalBalance(wallet))
      const fromGranted = Math.min(wallet.balance_granted, owed)
      dGranted = -fromGranted
      dPurchased = -(owed - fromGranted)
    }

    const nextPurchased = wallet.balance_purchased + dPurchased
    const nextGranted = wallet.balance_granted + dGranted

    const patch: Record<string, unknown> = {
      balance_purchased: nextPurchased,
      balance_granted: nextGranted,
      updated_at: new Date().toISOString(),
    }
    if (input.reason === 'purchase' && input.amountCents) {
      patch.total_paid_cents = wallet.total_paid_cents + input.amountCents
    }
    if (input.reason === 'cash_refund' && input.amountCents) {
      patch.total_refunded_cents = wallet.total_refunded_cents + input.amountCents
    }
    if (input.reason === 'refund_failed' && input.amountCents) {
      // A refund we could not deliver was never a refund. It leaves the running
      // total the same way it went in, so the figure keeps meaning "cash this
      // family actually got back".
      patch.total_refunded_cents = Math.max(0, wallet.total_refunded_cents - input.amountCents)
    }
    if (isReversal(input.reason) && input.amountCents) {
      // Money that came back out was never really paid, so it leaves
      // total_paid_cents rather than joining total_refunded_cents -- a bank
      // return is not a refund, and the deferred-revenue report must not
      // count it as one. Clamped because the column may not go below zero.
      patch.total_paid_cents = Math.max(0, wallet.total_paid_cents - input.amountCents)
    }
    const nextForgiveness = wallet.forgiveness_used + (input.consumeForgiveness ? 1 : 0)
    if (input.consumeForgiveness) {
      patch.forgiveness_used = nextForgiveness
    }

    // The guard: apply only if the wallet is still exactly as we read it.
    const { data: updated } = await svc
      .from('point_wallets')
      .update(patch)
      .eq('id', wallet.id)
      .eq('balance_purchased', wallet.balance_purchased)
      .eq('balance_granted', wallet.balance_granted)
      .eq('forgiveness_used', wallet.forgiveness_used)
      .select('*')
      .maybeSingle()

    if (!updated) { last = 'the wallet changed underneath us'; continue }

    const { data: entry, error: ledgerErr } = await svc
      .from('point_ledger')
      .insert({
        wallet_id: wallet.id,
        parent_id: input.parentId,
        delta_purchased: dPurchased,
        delta_granted: dGranted,
        balance_purchased_after: nextPurchased,
        balance_granted_after: nextGranted,
        reason: input.reason,
        booking_id: input.bookingId ?? null,
        amount_cents: input.amountCents ?? null,
        stripe_session_id: input.stripeSessionId ?? null,
        pricing: input.pricing ?? null,
        note: input.note ?? null,
        actor: input.actor,
      })
      .select('id')
      .single()

    if (ledgerErr) {
      // Put the wallet back. Money that moved with no record of why is worse
      // than money that did not move.
      //
      // Two things this has to get right. It names every field this attempt
      // touched, the running totals included -- restoring the balances alone
      // used to leave total_paid_cents counting a payment that never landed,
      // and that figure is what the deferred-revenue report and any future
      // cash refund are measured against. And it is guarded on the row still
      // holding exactly what we wrote, so if another writer got there first
      // the undo declines rather than overwriting their work.
      const undo: Record<string, unknown> = {
        balance_purchased: wallet.balance_purchased,
        balance_granted: wallet.balance_granted,
        forgiveness_used: wallet.forgiveness_used,
        updated_at: new Date().toISOString(),
      }
      if (patch.total_paid_cents !== undefined) undo.total_paid_cents = wallet.total_paid_cents
      if (patch.total_refunded_cents !== undefined) undo.total_refunded_cents = wallet.total_refunded_cents

      const { data: undone } = await svc
        .from('point_wallets')
        .update(undo)
        .eq('id', wallet.id)
        .eq('balance_purchased', nextPurchased)
        .eq('balance_granted', nextGranted)
        .eq('forgiveness_used', nextForgiveness)
        .select('id')
        .maybeSingle()
      if (!undone) {
        console.error(
          `point_wallets ${wallet.id}: a ledger write failed and the wallet moved before it could be undone. ` +
          `Reconcile by hand: reason=${input.reason} points=${input.points} session=${input.stripeSessionId ?? 'none'}`
        )
      }

      // A duplicate is not a failure -- the movement is already on the books.
      if ((ledgerErr as any).code === '23505') {
        throw new DuplicateLedgerEntry(input.reason, input.stripeSessionId ?? null)
      }
      throw new Error(`Could not record the points movement: ${ledgerErr.message}`)
    }

    return { wallet: updated as Wallet, ledgerId: entry.id, balance: nextPurchased + nextGranted }
  }

  throw new Error(`The points wallet was too busy to update (${last})`)
}

/** A Stripe purchase landing in the wallet. One point per dollar, always. */
export async function creditPurchase(
  svc: Svc,
  args: { parentId: string; amountCents: number; stripeSessionId: string },
) {
  return applyPoints(svc, {
    parentId: args.parentId,
    reason: 'purchase',
    points: centsToPoints(args.amountCents),
    amountCents: args.amountCents,
    stripeSessionId: args.stripeSessionId,
    actor: 'system',
  })
}

/**
 * Points taken back because the payment did not stand up: a bank return, or a
 * dispute the customer raised with their bank. Allowed to leave the wallet
 * negative -- see ApplyInput.allowNegative.
 *
 * Idempotent through the ledger: a unique index permits one reversal per
 * Stripe session, so a redelivered event raises DuplicateLedgerEntry rather
 * than taking the points twice.
 */
export async function reversePurchase(
  svc: Svc,
  args: {
    parentId: string
    amountCents: number
    stripeSessionId: string
    reason: ReversalReason
    note?: string | null
  },
) {
  return applyPoints(svc, {
    parentId: args.parentId,
    reason: args.reason,
    points: -centsToPoints(args.amountCents),
    amountCents: args.amountCents,
    stripeSessionId: args.stripeSessionId,
    allowNegative: true,
    note: args.note ?? null,
    actor: 'system',
  })
}

/** Has this Stripe session already been reversed? */
export async function purchaseAlreadyReversed(svc: Svc, stripeSessionId: string): Promise<boolean> {
  const { data } = await svc
    .from('point_ledger')
    .select('id')
    .eq('stripe_session_id', stripeSessionId)
    .in('reason', REVERSAL_REASONS as unknown as string[])
    .limit(1)
  return !!(data && data.length)
}

/** Points the family owes us, or 0. A wallet in arrears cannot book. */
export const arrears = (w: Wallet) => (w.balance_purchased < 0 ? -w.balance_purchased : 0)

/**
 * Has this Stripe session already been credited? Stripe retries webhooks, and
 * a retry must not hand out the points twice.
 */
export async function purchaseAlreadyCredited(svc: Svc, stripeSessionId: string): Promise<boolean> {
  const { data } = await svc
    .from('point_ledger')
    .select('id')
    .eq('stripe_session_id', stripeSessionId)
    .eq('reason', 'purchase')
    .limit(1)
  return !!(data && data.length)
}
