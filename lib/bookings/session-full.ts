/* The database's last-seat guard (docs/migration-capacity-guard.sql, owner
   2026-10-16, F81): a BEFORE trigger on bookings refuses any row that would
   take a class past class_sessions.max_students, with the message
   SESSION_FULL. The routes' own seat checks read and then write, so two
   families paying for the last seat at the same moment could both get it;
   the trigger is the one place both have to pass in turn. No one may
   overbook on purpose, the desk included.

   Every route that inserts a booking, or moves one into a session or back
   into a counted status, tests its write error with isSessionFull() and
   undoes what it already did (points, vouchers, sibling rows) the way its
   other failures do. Until the SQL is run the error never occurs, so this
   is inert. Client-safe: no server imports. */

/** Raised by public.bookings_capacity_guard(). */
export const SESSION_FULL = 'SESSION_FULL'

/** Parent-facing words; lib/i18n/errors.ts maps them to err.sessionFull. */
export const SESSION_FULL_ERROR = 'This time is now full. Please pick another time.'

/** The desk's code; lib/admin/desk-errors.ts BOOKING_ERROR_KEYS maps it. */
export const SESSION_FULL_CODE = 'session_full'

/** Whether a Supabase/PostgREST write error (or a thrown Error) is the guard. */
export function isSessionFull(err: unknown): boolean {
  if (!err) return false
  const msg = typeof err === 'string' ? err : (err as { message?: unknown }).message
  return typeof msg === 'string' && msg.includes(SESSION_FULL)
}

/** The response body for a parent route: English the client maps, plus the code. */
export const sessionFullBody = () => ({ error: SESSION_FULL_ERROR, code: SESSION_FULL_CODE })

/** The response body for a desk route: the staff screen shows its own words
 *  for the code (admin.booking.err.sessionFull); the English is a fallback. */
export const sessionFullDeskBody = () => ({
  error: 'This lesson is full, so nobody else can be added. Nothing was booked or charged.',
  code: SESSION_FULL_CODE,
})

/** A move that lost the family's ORIGINAL lesson (lib/bookings/unrestored):
 *  the old seat was sold while the lesson was being moved, so it could not be
 *  put back, and its points were returned. Never say it was kept. */
export const LESSON_LOST_CODE = 'LESSON_LOST_REFUNDED'
/** Needle for lib/i18n/errors.ts (err.lessonLost). */
export const LESSON_LOST_ERROR = 'Your original lesson could not be kept because its spot was just taken.'
export const lessonLostBody = (points: number) => ({
  error: points > 0
    ? `${LESSON_LOST_ERROR} We have returned ${points} points to your account, and our team will contact you.`
    : `${LESSON_LOST_ERROR} Our team will contact you.`,
  code: LESSON_LOST_CODE,
  points,
})

/** The class_sessions id the guard named (its DETAIL, docs/migration-capacity-guard.sql). */
export function fullSessionId(err: unknown): string | null {
  const e = err as { details?: unknown; message?: unknown } | null
  const text = `${typeof e?.details === 'string' ? e.details : ''} ${typeof e?.message === 'string' ? e.message : ''}`
  const m = text.match(/class_session ([0-9a-f-]{36})/i)
  return m ? m[1] : null
}
