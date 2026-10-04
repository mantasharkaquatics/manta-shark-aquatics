// A booking row is not always a lesson. A parent's basket (in_cart), a checkout
// that never paid (pending_payment) and a partner invite nobody accepted
// (pending_partner) all sit on a class_session just like a confirmed booking.
// The coach screens only filtered out 'cancelled', so those showed up as
// swimmers the coach was expecting (found 2026-10-04). Everything else --
// confirmed, completed -- is a real lesson.
export const NOT_REAL_BOOKING_STATUSES = ['cancelled', 'in_cart', 'pending_payment', 'pending_partner']

export function isRealBooking(b: { status?: string | null } | null | undefined): boolean {
  return !!b && !NOT_REAL_BOOKING_STATUSES.includes(String(b.status))
}
