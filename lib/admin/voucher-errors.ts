/* Error codes from /api/admin/vouchers to staff locale keys. The route's
   `error` is English; the Vouchers page and a family's view showed it as is
   on a Chinese screen (found 2026-10-08). An unknown code gets the screen's
   own generic message. Client-safe: no server imports. */
export const VOUCHER_ERROR_KEYS: Record<string, string> = {
  missing_fields: 'admin.vouchers.err.missingFields',
  pair_needed: 'admin.vouchers.err.pairNeeded',
  sixty_private_only: 'admin.vouchers.err.sixtyPrivateOnly',
  not_in_family: 'admin.vouchers.err.notInFamily',
  reason_required: 'admin.vouchers.err.reasonRequired',
  not_unused: 'admin.vouchers.err.notUnused',
}
