/* Error codes from the desk's routes to staff locale keys (found 2026-10-15).
   The routes' `error` is English, and check-in, the POS and "cancel one
   student" showed it as is on a Chinese staff screen -- the POS's "Do not take
   payment again" among them. Same pattern as lib/admin/voucher-errors.ts.
   Client-safe: no server imports. */

/** lib/checkin.ts codes, via /api/admin/attendance/batch. Each key takes
 *  {name}; 'db' has none and gets the screen's generic message. */
export const CHECKIN_ERROR_KEYS: Record<string, string> = {
  not_found: 'admin.checkin.err.notFound',
  no_lesson_today: 'admin.checkin.err.noLessonToday',
  not_open: 'admin.checkin.err.notOpen',
  team_wrong_session: 'admin.checkin.err.teamWrongSession',
  team_not_open: 'admin.checkin.err.teamNotOpen',
}

/** /api/pos/complete-* and /api/pos/retry-credit. Variables come from the
 *  response: {paid} {extra} from `points`, {reason} from `reason` (the sale
 *  check's own words, still English). */
export const POS_ERROR_KEYS: Record<string, string> = {
  not_recorded: 'admin.pos.err.notRecorded',
  still_recording: 'admin.pos.err.stillRecording',
  points_missing: 'admin.pos.err.pointsMissing',
  bonus_missing: 'admin.pos.err.bonusMissing',
  no_points: 'admin.pos.err.noPoints',
  bonus_not_added: 'admin.pos.err.bonusNotAdded',
  rate_points_not_added: 'admin.pos.err.ratePointsNotAdded',
  duplicate_recent: 'admin.pos.err.duplicateRecent',
  duplicate_recent_team: 'admin.pos.err.duplicateRecentTeam',
  charged_needs_override: 'admin.pos.err.chargedNeedsOverride',
  charged_refused: 'admin.pos.err.chargedRefused',
  trial_not_recorded: 'admin.pos.err.trialNotRecorded',
  trial_credit_missing: 'admin.pos.err.trialCreditMissing',
  trial_used: 'admin.pos.err.trialUsed',
  retry_failed: 'admin.pos.err.retryFailed',
  // Zelle (lib/zelle-server.ts withZelle). zelle_not_enough's {reason} is
  // what is left on the receipt, e.g. "$15.00".
  zelle_missing: 'admin.pos.err.zelleMissing',
  zelle_not_found: 'admin.pos.err.zelleNotFound',
  zelle_unverified: 'admin.pos.err.zelleUnverified',
  zelle_dismissed: 'admin.pos.err.zelleDismissed',
  zelle_not_enough: 'admin.pos.err.zelleNotEnough',
  zelle_failed: 'admin.pos.err.zelleFailed',
}

/** /api/admin/cancel-booking. */
export const CANCEL_ERROR_KEYS: Record<string, string> = {
  not_found: 'admin.booking.err.bookingNotFound',
  already_cancelled: 'admin.booking.err.alreadyCancelled',
  changed: 'admin.booking.err.changed',
  lesson_past: 'admin.booking.err.lessonPast',
  checked_in: 'admin.booking.err.checkedIn',
  trial_no_voucher: 'admin.booking.err.trialNoVoucher',
  course_no_voucher: 'admin.booking.err.courseNoVoucher',
  pair_two_families: 'admin.booking.err.pairTwoFamilies',
  pair_one_swimmer: 'admin.booking.err.pairOneSwimmer',
  stripe_close_failed: 'admin.booking.err.stripeCloseFailed',
  voucher_not_issued: 'admin.booking.err.voucherNotIssued',
}

/** Booking writes from the desk (bulk-create, trial-credit-book, the POS and
 *  trial checkout): the database's last-seat guard (lib/bookings/session-full,
 *  F81). Nothing was booked or charged when this comes back. */
export const BOOKING_ERROR_KEYS: Record<string, string> = {
  session_full: 'admin.booking.err.sessionFull',
}

/** The same codes when the route also names the date (bulk-create). */
export const BOOKING_ERROR_DATED_KEYS: Record<string, string> = {
  session_full: 'admin.booking.err.sessionFullOn',
}
