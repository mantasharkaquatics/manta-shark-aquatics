// The points pricing engine. Every number a parent is ever charged comes from
// here, and nothing else computes a price.
//
// One currency (1 point = US$1, never expires), two discounts, both applied at
// booking time rather than at purchase. That is the whole design: a discount
// that is earned by taking a lesson cannot be refunded back out, so there is no
// "buy the big bundle, take ten lessons, refund the rest" arbitrage.
//
// Design book: the artifact published 2026-09-01. If you change a number here,
// change the User Agreement too -- parents are told these rules.

import { getTodayLA } from '@/lib/date'

// --- Base prices, per swimmer, per 30 minutes -------------------------------
// This is the ceiling. Everything below is a discount off it; there is no
// surcharge anywhere in the system, deliberately. "Off-peak saves 3 points"
// and "peak costs 3 points more" are the same arithmetic and land completely
// differently on a parent.
export const BASE_POINTS: Record<string, number> = {
  '1on1': 65,
  '1on2': 50,
  '1on4': 40,
}

/** The Swim Assessment: one per swimmer, 30 minutes, 1-on-1. */
export const ASSESSMENT_POINTS = 85

/** Swim Team is a monthly subscription and never touches points. */
export const TEAM_SLUG = 'team'

// --- Buying points ------------------------------------------------------------
// No volume discount, on purpose. A discount given at purchase can be refunded
// back out -- buy the biggest bundle, take ten lessons, refund the rest, and you
// have bought lessons at the bulk rate with no commitment. Every discount in
// this system is earned at the moment of booking instead, where it cannot be
// handed back.
export const MIN_TOPUP_DOLLARS = 50
export const MAX_TOPUP_DOLLARS = 10_000

/** The amounts offered as one-tap choices. Any other figure is still allowed. */
export const TOPUP_PRESETS = [500, 1000, 2000] as const

// --- VIP, by lessons completed ----------------------------------------------
// Earned by attending, not by spending. Retroactive: the moment a family moves
// up, every point already in their wallet buys more. That is why this is a
// discount on the lesson and not a better exchange rate on the purchase -- an
// exchange rate would only help points bought *after* the upgrade, which
// punishes the families who committed earliest.
export const VIP_TIERS = [
  { level: 5, lessons: 80, discount: 0.12 },
  { level: 4, lessons: 50, discount: 0.09 },
  { level: 3, lessons: 30, discount: 0.07 },
  { level: 2, lessons: 20, discount: 0.05 },
  { level: 1, lessons: 10, discount: 0.03 },
  { level: 0, lessons: 0,  discount: 0    },
] as const

export type VipTier = { level: number; lessons: number; discount: number }

export function vipTier(lessonsCompleted: number): VipTier {
  return VIP_TIERS.find(t => lessonsCompleted >= t.lessons) ?? VIP_TIERS[VIP_TIERS.length - 1]
}

/** The next tier up, or null at the top. Drives the dashboard progress bar. */
export function nextVipTier(lessonsCompleted: number): { tier: VipTier; lessonsToGo: number } | null {
  const higher = [...VIP_TIERS].reverse().find(t => t.lessons > lessonsCompleted)
  return higher ? { tier: higher, lessonsToGo: higher.lessons - lessonsCompleted } : null
}

// --- Off-peak ----------------------------------------------------------------
export const OFF_PEAK_DISCOUNT = 0.05

// Minutes from midnight, in the school's local time. Weekday 0 = Sunday.
// The pool opens 6:00 and closes 21:00 daily; on weekdays half of that is
// off-peak, which is fine at 5% but worth re-checking before widening it.
const OFF_PEAK_WINDOWS: Record<number, [number, number][]> = {
  0: [[6 * 60, 10 * 60], [19 * 60 + 30, 21 * 60]], // Sun
  1: [[6 * 60, 12 * 60], [19 * 60 + 30, 21 * 60]], // Mon
  2: [[6 * 60, 12 * 60], [19 * 60 + 30, 21 * 60]],
  3: [[6 * 60, 12 * 60], [19 * 60 + 30, 21 * 60]],
  4: [[6 * 60, 12 * 60], [19 * 60 + 30, 21 * 60]],
  5: [[6 * 60, 12 * 60], [19 * 60 + 30, 21 * 60]], // Fri
  6: [[6 * 60, 10 * 60], [19 * 60 + 30, 21 * 60]], // Sat
}

/** 'HH:MM' or 'HH:MM:SS' -> minutes from midnight. */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

/**
 * Judged on the START time only. A 30-minute lesson beginning 11:45 on a
 * Tuesday is off-peak even though it ends after noon -- the parent picked an
 * off-peak slot, and a rule they can check against the clock beats one that is
 * technically neater.
 *
 * dateStr is 'YYYY-MM-DD' in the school's local date; parsed as a plain date so
 * a UTC server cannot shift it a day.
 */
export function isOffPeak(dateStr: string, startTime: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const mins = toMinutes(startTime)
  return (OFF_PEAK_WINDOWS[weekday] || []).some(([from, to]) => mins >= from && mins < to)
}

// --- The price ----------------------------------------------------------------
export type PriceInput = {
  /** course_types.slug, or omit and set isAssessment. */
  courseSlug?: string | null
  isAssessment?: boolean
  /** 30 or 60. An hour lesson is two consecutive slots and costs twice. */
  minutes?: number
  /** From points_lessons_completed() -- never a stored counter. */
  lessonsCompleted: number
  sessionDate: string
  startTime: string
  /** Swimmers this family is paying for in this lesson. 1-on-2 with two of
   *  your own children is 2; sharing with another family is 1 each. */
  seats?: number
}

export type PriceBreakdown = {
  /** Per seat, per lesson, before any discount. */
  base: number
  seats: number
  vipLevel: number
  vipPct: number
  offPeak: boolean
  offPeakPct: number
  /** Per seat, after discounts. */
  perSeat: number
  /** What the wallet is actually debited. */
  charged: number
}

/**
 * Discounts multiply and are floored ONCE, per seat.
 *
 * Flooring per line item instead would make the arithmetic depend on the order
 * the discounts were applied, and two parents on the same tier could be charged
 * differently for the same slot. Flooring rather than rounding means the
 * remainder always goes to the parent.
 */
export function priceLesson(input: PriceInput): PriceBreakdown {
  const seats = Math.max(1, input.seats ?? 1)
  const halfHours = (input.minutes ?? 30) === 60 ? 2 : 1

  if (input.courseSlug === TEAM_SLUG) {
    throw new Error('Swim Team is a monthly membership and is not paid with points')
  }

  const unit = input.isAssessment
    ? ASSESSMENT_POINTS
    : BASE_POINTS[input.courseSlug ?? '']
  if (unit === undefined) {
    throw new Error(`No points price for course "${input.courseSlug}"`)
  }

  const base = unit * halfHours
  const tier = vipTier(input.lessonsCompleted)
  const offPeak = isOffPeak(input.sessionDate, input.startTime)
  const offPeakPct = offPeak ? OFF_PEAK_DISCOUNT : 0

  const perSeat = Math.floor(base * (1 - tier.discount) * (1 - offPeakPct))

  return {
    base,
    seats,
    vipLevel: tier.level,
    vipPct: tier.discount,
    offPeak,
    offPeakPct,
    perSeat,
    charged: perSeat * seats,
  }
}

// --- Late-cancellation forgiveness -------------------------------------------
// Same counter as VIP, so there is no second rule to explain or maintain.
export const LESSONS_PER_FORGIVENESS = 10

export function forgivenessAvailable(lessonsCompleted: number, forgivenessUsed: number): number {
  return Math.max(0, Math.floor(lessonsCompleted / LESSONS_PER_FORGIVENESS) - forgivenessUsed)
}

// --- Money --------------------------------------------------------------------
/** 1 point = US$1, fixed forever. Both directions, so nothing can drift. */
export const CENTS_PER_POINT = 100
export const pointsToCents = (points: number) => points * CENTS_PER_POINT
export const centsToPoints = (cents: number) => Math.floor(cents / CENTS_PER_POINT)

/**
 * Cash refund for an unused balance. Only purchased points are refundable --
 * points an admin granted were never paid for, and refunding them would turn a
 * courtesy into a withdrawal.
 */
export const refundableCents = (balancePurchased: number) => pointsToCents(balancePurchased)

/** Today in the school's timezone, for callers that need a default date. */
export const todayLA = getTodayLA
