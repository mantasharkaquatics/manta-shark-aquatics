// What is still sold as a fixed price.
//
// Lesson packages are gone: lessons are paid for out of a points wallet, and
// what a lesson costs lives in lib/points.ts. Two things never became points
// and are still priced in dollars here.

/**
 * The Swim Assessment. Charged to the card, not to the wallet, because a family
 * books it before they have a wallet -- it is the first thing they ever buy
 * from us, and asking them to top up first would be asking them to commit
 * before they have seen the pool.
 */
export const TRIAL_PRICE_CENTS = 8500

/**
 * How long an unpaid Swim Assessment holds its slot. Kept short on purpose: a
 * held slot is one no other family can book. Stripe will not let a checkout
 * expire sooner than 30 minutes, so the checkout is closed by us at this mark
 * (lib/trial-booking.ts) rather than by Stripe.
 */
export const TRIAL_HOLD_MINUTES = 15

/**
 * Swim Team is a monthly membership, not a lesson. The real price comes from
 * team_tiers.monthly_price_cents per squad; this is only the label used where a
 * screen has to name the product before a tier is known.
 */
export const TEAM_PLAN = {
  id: 'team',
  name: 'Swim Team · Monthly',
  courseSlug: 'team',
} as const
