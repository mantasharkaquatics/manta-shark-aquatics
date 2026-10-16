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
