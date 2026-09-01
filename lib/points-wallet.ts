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

const MAX_ATTEMPTS = 4

export class InsufficientPoints extends Error {
  constructor(public needed: number, public available: number) {
    super('NOT_ENOUGH_POINTS')
    this.name = 'InsufficientPoints'
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
    } else {
      const owed = -input.points
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
    if (input.consumeForgiveness) {
      patch.forgiveness_used = wallet.forgiveness_used + 1
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
      // Put the balance back. Money that moved with no record of why is worse
      // than money that did not move.
      await svc.from('point_wallets').update({
        balance_purchased: wallet.balance_purchased,
        balance_granted: wallet.balance_granted,
        forgiveness_used: wallet.forgiveness_used,
      }).eq('id', wallet.id)
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
