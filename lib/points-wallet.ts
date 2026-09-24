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
  grantedExpiry,
  LESSONS_PER_FORGIVENESS,
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
  | 'grant_expired' | 'referral_bonus'

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
 * It drives the forgiveness count, so it must not be cached
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

// --- Granted points, lot by lot ------------------------------------------------
//
// The wallet keeps ONE number for granted points, but each grant has its own
// expiry date (lib/points GRANTED_POINTS_VALID_MONTHS). Rather than a second
// table that could drift from the balance, the lots are rebuilt from the
// ledger, which already records every granted movement in order:
//
//   - a row that ADDS granted points opens a lot, carrying its expiry date;
//   - a row that TAKES granted points consumes the soonest-expiring lot first.
//
// "Soonest first" is what a family would choose, and it means the daily expiry
// run only ever finds points nobody could have used. A lot with no date --
// anything granted before expiry existed -- never expires and is spent last.

export type GrantLot = { expiresAt: string | null; remaining: number }
export type GrantTake = { expiresAt: string | null; points: number }
type GrantRow = { delta_granted: number; granted_expires_at?: string | null }

const expiryMs = (e: string | null) => (e === null ? Infinity : Date.parse(e))

/** Takes `n` points from the lots, soonest expiry first. Mutates `lots`. */
export function takeFromLots(lots: GrantLot[], n: number): GrantTake[] {
  const order = lots.map((_, i) => i)
    .sort((a, b) => expiryMs(lots[a].expiresAt) - expiryMs(lots[b].expiresAt) || a - b)
  const taken: GrantTake[] = []
  let left = n
  for (const i of order) {
    if (left <= 0) break
    const k = Math.min(lots[i].remaining, left)
    if (k <= 0) continue
    lots[i].remaining -= k
    left -= k
    taken.push({ expiresAt: lots[i].expiresAt, points: k })
  }
  return taken
}

/** The lots still holding points, replayed from the granted side of a ledger. */
export function replayGrantLots(rows: GrantRow[]): GrantLot[] {
  const lots: GrantLot[] = []
  for (const r of rows) {
    const d = Number(r.delta_granted) || 0
    if (d > 0) lots.push({ expiresAt: r.granted_expires_at ?? null, remaining: d })
    else if (d < 0) takeFromLots(lots, -d)
  }
  return lots.filter(l => l.remaining > 0)
}

/** Points in lots whose date has passed. */
export const dueToExpire = (lots: GrantLot[], now: Date = new Date()) =>
  lots.reduce((a, l) => a + (l.expiresAt !== null && Date.parse(l.expiresAt) <= now.getTime() ? l.remaining : 0), 0)

/**
 * The expiry a batch of taken points carries back if it is ever returned: the
 * LATEST date among the lots it came from, or none if any lot had none. One
 * date per spend keeps a refund simple, and "latest" never shortens a gift.
 */
export function latestExpiry(taken: GrantTake[]): string | null {
  if (taken.length === 0) return null
  if (taken.some(t => t.expiresAt === null)) return null
  return taken.reduce((m, t) => (Date.parse(t.expiresAt!) > Date.parse(m) ? t.expiresAt! : m), taken[0].expiresAt!)
}

/**
 * The wallet's granted lots, read from the ledger. Returns null when the
 * ledger and the balance disagree -- a write landed between the two reads --
 * so the caller can read again rather than act on a mismatched picture.
 */
async function readGrantLots(svc: Svc, wallet: Wallet): Promise<GrantLot[] | null> {
  const { data, error } = await svc
    .from('point_ledger')
    .select('delta_granted, granted_expires_at, created_at')
    .eq('wallet_id', wallet.id)
    .neq('delta_granted', 0)
    .order('created_at', { ascending: true })
  if (error) throw new Error(`Could not read granted points: ${error.message}`)
  const lots = replayGrantLots(data || [])
  const sum = lots.reduce((a, l) => a + l.remaining, 0)
  return sum === wallet.balance_granted ? lots : null
}

/** Everything the booking page and the dashboard need, in one round trip. */
export async function walletSummary(svc: Svc, parentId: string) {
  const wallet = await getWallet(svc, parentId)
  const completed = await lessonsCompleted(svc, parentId)
  // The next date on which some granted points stop working, so the card can
  // say so before it happens rather than after.
  let grantedNextExpiry: { date: string; points: number } | null = null
  if (wallet.balance_granted > 0) {
    const lots = (await readGrantLots(svc, wallet)) || []
    const dated = lots.filter(l => l.expiresAt !== null)
      .sort((a, b) => expiryMs(a.expiresAt) - expiryMs(b.expiresAt))
    if (dated.length > 0) {
      const first = dated[0].expiresAt!
      // Several grants can land on the same day; count them together.
      const sameDay = dated.filter(l => l.expiresAt!.slice(0, 10) === first.slice(0, 10))
      grantedNextExpiry = { date: first, points: sameDay.reduce((a, l) => a + l.remaining, 0) }
    }
  }
  return {
    balance: totalBalance(wallet),
    balancePurchased: wallet.balance_purchased,
    balanceGranted: wallet.balance_granted,
    grantedNextExpiry,
    // Non-zero only after a bank return or a dispute clawed points back out.
    arrears: arrears(wallet),
    lessonsCompleted: completed,
    forgiveness: forgivenessAvailable(completed, wallet.forgiveness_used),
    lessonsPerForgiveness: LESSONS_PER_FORGIVENESS,
  }
}

type ApplyInput = {
  parentId: string
  reason: LedgerReason
  /** Positive adds, negative spends. Granted points are spent first. */
  points: number
  /**
   * Adds ALL of `points` to the granted side: admin_grant, a POS bonus, a
   * referral reward. Granted points are never refundable for cash, and expire
   * (see lib/points GRANTED_POINTS_VALID_MONTHS) unless grantedExpiresAt says
   * otherwise.
   */
  toGranted?: boolean
  /**
   * Returns only: how many of `points` go back to the granted side. A lesson
   * paid partly with granted points returns that part as granted points, or a
   * cancelled lesson would turn a gift into cash-refundable points that never
   * expire.
   */
  grantedPart?: number
  /** With toGranted or grantedPart: the expiry the returned points keep. */
  grantedExpiresAt?: string | null
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

export type ApplyResult = {
  wallet: Wallet
  ledgerId: string
  balance: number
  /** Spends only: how many granted points this spend used. */
  grantedTaken: number
  /** ...and the expiry they keep if they are ever handed back. */
  grantedExpiresAt: string | null
}

type Movement = {
  dPurchased: number
  dGranted: number
  /** Written on the ledger row when dGranted > 0. */
  grantedExpiresAt: string | null
}

/**
 * The guarded write: moves the wallet from exactly `wallet` by `m` and records
 * it. Returns null when the wallet changed underneath -- the caller reads again
 * and retries. Throws when the ledger will not take the row, after putting the
 * wallet back.
 */
async function writeMovement(
  svc: Svc, wallet: Wallet, m: Movement, input: ApplyInput,
): Promise<{ wallet: Wallet; ledgerId: string; balance: number } | null> {
  const nextPurchased = wallet.balance_purchased + m.dPurchased
  const nextGranted = wallet.balance_granted + m.dGranted

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

  if (!updated) return null

  const { data: entry, error: ledgerErr } = await svc
    .from('point_ledger')
    .insert({
      wallet_id: wallet.id,
      parent_id: input.parentId,
      delta_purchased: m.dPurchased,
      delta_granted: m.dGranted,
      balance_purchased_after: nextPurchased,
      balance_granted_after: nextGranted,
      reason: input.reason,
      booking_id: input.bookingId ?? null,
      amount_cents: input.amountCents ?? null,
      stripe_session_id: input.stripeSessionId ?? null,
      pricing: input.pricing ?? null,
      note: input.note ?? null,
      actor: input.actor,
      granted_expires_at: m.dGranted > 0 ? m.grantedExpiresAt : null,
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

/**
 * The single write path.
 *
 * Spending draws on granted points before purchased ones, soonest-expiring
 * first. A family given 50 courtesy points should spend those first -- and it
 * means a later cash refund can only ever reach points they actually paid for.
 */
export async function applyPoints(svc: Svc, input: ApplyInput): Promise<ApplyResult> {
  if (!Number.isInteger(input.points)) throw new Error('Points must be a whole number')
  if (input.points === 0) throw new Error('Refusing to write a zero-point ledger entry')
  if ((input.reason === 'admin_grant' || input.reason === 'admin_deduct') && !input.note?.trim()) {
    throw new Error('A manual points adjustment needs a reason')
  }
  const grantedPart = input.grantedPart ?? 0
  if (!Number.isInteger(grantedPart) || grantedPart < 0 || (grantedPart > 0 && (input.points < grantedPart || input.toGranted))) {
    throw new Error('grantedPart must be a whole number between 0 and the points returned')
  }

  let last = ''
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const wallet = await getWallet(svc, input.parentId)

    let dGranted = 0
    let dPurchased = 0
    let grantedExpiresAt: string | null = null
    let taken: GrantTake[] = []

    if (input.points > 0) {
      if (input.toGranted) {
        dGranted = input.points
        grantedExpiresAt = input.grantedExpiresAt !== undefined ? input.grantedExpiresAt : grantedExpiry()
      } else {
        dGranted = grantedPart
        dPurchased = input.points - grantedPart
        grantedExpiresAt = grantedPart > 0 ? (input.grantedExpiresAt ?? null) : null
      }
    } else if (input.reason === 'cash_refund') {
      // Cash goes back only for points that were paid for, so it comes out of
      // the purchased side alone. Taking granted points first here -- the
      // spending order -- would leave purchased points behind that a second
      // refund could cash out, turning a gift into money.
      const owed = -input.points
      if (wallet.balance_purchased < owed) throw new InsufficientPoints(owed, Math.max(0, wallet.balance_purchased))
      dPurchased = input.points
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
      if (fromGranted > 0) {
        // Which lots this spend draws on decides the expiry the points keep
        // if the lesson is cancelled. A mismatched read means a write landed
        // between the two reads; read again rather than guess.
        const lots = await readGrantLots(svc, wallet)
        if (!lots) {
          last = 'the granted points and the ledger disagreed'
          if (attempt < MAX_ATTEMPTS - 1) continue
          // Still spend -- refusing a booking over bookkeeping would be worse
          // -- but the points lose their date if they ever come back.
          console.error(`point_wallets ${wallet.id}: granted lots do not add up to balance_granted; spending without an expiry`)
          taken = [{ expiresAt: null, points: fromGranted }]
        } else {
          taken = takeFromLots(lots, fromGranted)
        }
      }
    }

    const res = await writeMovement(svc, wallet, { dPurchased, dGranted, grantedExpiresAt }, input)
    if (!res) { last = 'the wallet changed underneath us'; continue }
    return {
      ...res,
      grantedTaken: dGranted < 0 ? -dGranted : 0,
      grantedExpiresAt: dGranted < 0 ? latestExpiry(taken) : grantedExpiresAt,
    }
  }

  throw new Error(`The points wallet was too busy to update (${last})`)
}

/**
 * Takes away granted points whose year is up. Run daily. Returns how many
 * points expired (0 when none were due).
 *
 * Only ever touches the granted side, and runs even for a wallet in arrears --
 * an expiry is a date passing, not a spend.
 */
export async function expireGrantedPoints(svc: Svc, parentId: string, now: Date = new Date()): Promise<number> {
  let last = ''
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const wallet = await getWallet(svc, parentId)
    if (wallet.balance_granted <= 0) return 0
    const lots = await readGrantLots(svc, wallet)
    if (!lots) { last = 'the granted points and the ledger disagreed'; continue }
    const due = Math.min(dueToExpire(lots, now), wallet.balance_granted)
    if (due <= 0) return 0
    const res = await writeMovement(
      svc, wallet, { dPurchased: 0, dGranted: -due, grantedExpiresAt: null },
      { parentId, reason: 'grant_expired', points: -due, actor: 'system' },
    )
    if (res) return due
    last = 'the wallet changed underneath us'
  }
  throw new Error(`Could not expire granted points for ${parentId} (${last})`)
}

/**
 * Splits the granted points one spend took across the lessons it paid for,
 * in the order given: each lesson takes granted points up to its own price
 * until they run out. Stored on each booking (points_granted) so a single
 * cancelled lesson returns exactly its own share as granted points.
 */
export function splitGranted(grantedTaken: number, perLesson: number[]): number[] {
  let left = grantedTaken
  return perLesson.map(p => {
    const k = Math.max(0, Math.min(left, p))
    left -= k
    return k
  })
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
