// Every check a front-desk sale has to pass, in one place.
//
// The till charges a card in two steps: /api/stripe/terminal/create-*-payment-intent
// makes the PaymentIntent, the reader takes the money, and only then does the
// screen call /api/pos/complete-*. Those complete routes used to be the only
// place a sale was checked, so a sale they refused -- a $62.50 unit price, a
// course type that is not paid for with points, a swimmer who already has a
// level or a live team subscription -- had already taken the family's money
// and recorded nothing (found 2026-10-05).
//
// So the same functions run twice: once when the PaymentIntent is made, before
// any money moves, and again when the sale is recorded, which is what actually
// decides. The PaymentIntent's amount comes from here too, never from the
// screen.
//
// Every function takes a service-role client and returns either the facts the
// sale needs or a refusal the route sends back as is.

import { BASE_POINTS, MIN_TOPUP_DOLLARS, MAX_TOPUP_DOLLARS } from '@/lib/points'
import { tierFor, TEAM_SQUAD_CAP, type TierBand } from '@/lib/team-tiers'

type Svc = any

export type SaleRefusal = { ok: false; status: number; error: string; extra?: Record<string, unknown> }

const refuse = (status: number, error: string, extra?: Record<string, unknown>): SaleRefusal =>
  ({ ok: false, status, error, extra })

/** The Swim Assessment sold at the desk. */
export const TRIAL_PRICE_CENTS = 8500
/** A programme sale's limits. A unit price is whole dollars because the
 *  dollars paid become purchased points one for one. */
export const MAX_SDP_SESSIONS = 200
export const MAX_SDP_UNIT_CENTS = 100_000
/** Course types a programme sale can be for: the ones priced in points. */
export const SDP_COURSE_SLUGS = Object.keys(BASE_POINTS)

/** What every desk card sale writes as the invoice's payment method. SDP sales
 *  used to write 'card' and team sales the raw 'stripe_terminal', so the Sales
 *  report's terminal filter missed both (found 2026-10-05). */
export const TERMINAL_INVOICE_LABEL = 'Credit Card (Terminal)'
export const invoicePaymentLabel = (paymentMethod: string) =>
  paymentMethod === 'stripe_terminal' ? TERMINAL_INVOICE_LABEL : paymentMethod

// --- Points top-up ------------------------------------------------------------

export type PointsSale = { ok: true; amountCents: number; dollars: number; bonus: number }

export function checkPointsSale(input: { parentId?: unknown; amountCents?: unknown; bonusPoints?: unknown }): PointsSale | SaleRefusal {
  if (!input.parentId) return refuse(400, 'parentId required')
  const amount = Math.round(Number(input.amountCents))
  if (!Number.isFinite(amount) || amount % 100 !== 0) return refuse(400, 'Amount must be a whole number of dollars')
  const dollars = amount / 100
  if (dollars < MIN_TOPUP_DOLLARS || dollars > MAX_TOPUP_DOLLARS)
    return refuse(400, `Amount must be between $${MIN_TOPUP_DOLLARS} and $${MAX_TOPUP_DOLLARS}`)
  const bonus = Math.round(Number(input.bonusPoints || 0))
  if (!Number.isFinite(bonus) || bonus < 0 || bonus > dollars)
    return refuse(400, 'Bonus points must be between 0 and the amount paid')
  return { ok: true, amountCents: amount, dollars, bonus }
}

// --- Programme (SDP) sale -----------------------------------------------------

export type SdpSale = {
  ok: true
  amountCents: number
  qty: number
  unit: number
  listPerLesson: number
  student: { id: string; full_name: string; parent_id: string; uci_number: string | null }
  courseType: { id: string; name: string; slug: string }
}

export async function checkSdpSale(svc: Svc, input: {
  parentId?: unknown; studentId?: unknown; courseTypeId?: unknown; sessions?: unknown; unitPriceCents?: unknown
}): Promise<SdpSale | SaleRefusal> {
  const { parentId, studentId, courseTypeId } = input
  const qty = Math.round(Number(input.sessions))
  const unit = Math.round(Number(input.unitPriceCents))
  if (!parentId || !studentId) return refuse(400, 'parentId and studentId required')
  if (!Number.isFinite(qty) || qty < 1 || qty > MAX_SDP_SESSIONS) return refuse(400, `Sessions must be between 1 and ${MAX_SDP_SESSIONS}`)
  if (!Number.isFinite(unit) || unit < 100 || unit > MAX_SDP_UNIT_CENTS) return refuse(400, 'Invalid unit price')
  if (unit % 100 !== 0) return refuse(400, 'Unit price must be a whole number of dollars')
  if (!courseTypeId) return refuse(400, 'courseTypeId required')

  const { data: student } = await svc
    .from('students').select('id, full_name, parent_id, uci_number')
    .eq('id', studentId).maybeSingle()
  if (!student || student.parent_id !== parentId) return refuse(400, 'Student does not belong to this parent')

  const { data: courseType } = await svc
    .from('course_types').select('id, name, slug').eq('id', courseTypeId).maybeSingle()
  if (!courseType) return refuse(400, 'Invalid course type')
  const listPerLesson = BASE_POINTS[courseType.slug]
  if (listPerLesson === undefined) return refuse(400, `${courseType.name} is not paid for with points.`)

  return { ok: true, amountCents: qty * unit, qty, unit, listPerLesson, student, courseType }
}

// --- Swim Assessment ----------------------------------------------------------

export type TrialSale = { ok: true; amountCents: number; student: { id: string; full_name: string; parent_id: string } }

export async function checkTrialSale(svc: Svc, input: { parentId?: unknown; studentId?: unknown }): Promise<TrialSale | SaleRefusal> {
  const { parentId, studentId } = input
  if (!parentId || !studentId) return refuse(400, 'parentId and studentId required')

  const { data: student } = await svc
    .from('students').select('id, full_name, parent_id, trial_used_at, current_level')
    .eq('id', studentId).maybeSingle()
  if (!student) return refuse(404, 'Student not found')
  if (student.parent_id !== parentId) return refuse(400, 'Student does not belong to this parent')
  if (student.trial_used_at) return refuse(400, 'This student has already used their Swim Assessment')
  if (student.current_level != null)
    return refuse(400, 'This student already has an assigned level and does not need a Swim Assessment')

  const { data: activeTrial } = await svc
    .from('bookings').select('id').eq('student_id', studentId)
    .eq('is_trial', true).neq('status', 'cancelled').limit(1)
  if (activeTrial && activeTrial.length > 0)
    return refuse(400, 'This student already has an active Swim Assessment booking')

  return { ok: true, amountCents: TRIAL_PRICE_CENTS, student }
}

// --- Swim Team prepaid months -------------------------------------------------

export type TeamSale = {
  ok: true
  amountCents: number
  months: number
  tier: { id: string; name: string; monthly_price_cents: number }
  student: { id: string; full_name: string; parent_id: string; current_level: number | null; current_stage: number | null }
  /** Why this squad is out of band for this swimmer; empty when it is not. */
  reasons: string[]
}

/**
 * The online route derives the squad from the swimmer's level and stage,
 * refuses an unassessed swimmer, and stops at the cap. The counter picks by
 * hand and keeps the last word, but an out-of-band sale has to be confirmed
 * (`override`) -- and that confirmation is asked for before the card, not
 * after it.
 */
export async function checkTeamSale(svc: Svc, input: {
  parentId?: unknown; studentId?: unknown; tierId?: unknown; months?: unknown; override?: unknown
}): Promise<TeamSale | SaleRefusal> {
  const { parentId, studentId, tierId } = input
  const m = parseInt(String(input.months), 10)
  if (!parentId || !studentId || !tierId || !m || m < 1 || m > 12) return refuse(400, 'Invalid input')

  const { data: tier } = await svc
    .from('team_tiers').select('id, name, monthly_price_cents').eq('id', tierId).maybeSingle()
  if (!tier) return refuse(400, 'Invalid tier')

  const { data: student } = await svc
    .from('students').select('id, full_name, parent_id, current_level, current_stage').eq('id', studentId).maybeSingle()
  if (!student) return refuse(400, 'Student not found')
  if (student.parent_id !== parentId) return refuse(400, 'Student does not belong to this parent')

  // One track per swimmer (owner 2026-07-22): a live subscription blocks a
  // prepaid sale.
  const { data: subRows } = await svc
    .from('team_memberships').select('id')
    .eq('student_id', studentId)
    .not('stripe_subscription_id', 'is', null)
    .in('status', ['active', 'past_due'])
  if ((subRows || []).length > 0) return refuse(409, 'Student already has an active subscription membership')

  const { data: allTiers } = await svc
    .from('team_tiers').select('id, name, level_min, level_max, min_stage, max_stage')
    .eq('active', true).order('level_min').order('min_stage')
  const recommended = tierFor((allTiers || []) as (TierBand & { id: string; name: string })[], student.current_level, student.current_stage)

  // A renewal for a swimmer already in this squad is not a new seat, so it is
  // counted out of the total rather than counted against it.
  const { count: others } = await svc
    .from('team_memberships').select('id', { count: 'exact', head: true })
    .eq('team_tier_id', tierId).in('status', ['active', 'past_due']).neq('student_id', studentId)

  const reasons: string[] = []
  if (student.current_level == null) reasons.push(`${student.full_name} has no swim assessment on file`)
  else if (!recommended) reasons.push(`Level ${student.current_level} is below the team minimum of Level 4`)
  else if (recommended.id !== tierId) reasons.push(`this swimmer's level places them in ${recommended.name}`)
  if ((others || 0) >= TEAM_SQUAD_CAP) reasons.push(`${tier.name} is already at ${others} of ${TEAM_SQUAD_CAP}`)

  if (reasons.length > 0 && !input.override) {
    return refuse(409, `Sold as ${tier.name}, but ${reasons.join('; ')}.`, {
      needs_override: true, reasons,
      recommended: recommended ? { id: recommended.id, name: recommended.name } : null,
    })
  }

  return { ok: true, amountCents: tier.monthly_price_cents * m, months: m, tier, student, reasons }
}
