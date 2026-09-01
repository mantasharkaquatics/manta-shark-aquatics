# The package-and-token system, kept for reference

These files ran the money side of the school until the points system replaced
them on 2026-09-01. They are here rather than deleted so that the reasoning
behind the old rules is still readable — several of them carry comments that
explain owner decisions, not just code.

Nothing here is imported. Next.js does not route from this directory, and the
routes below were moved out of `app/` rather than left disabled, so there is no
way to reach them by accident.

- `tokens.ts` — token eligibility, the token window, the cancellation quota, and
  the FIFO pool. The two clock rules that had nothing to do with money
  (`LEAD_TIME_MINUTES`, `meetsLeadTime`, `isWithin24Hours`) moved to
  `lib/booking-time.ts` and are still live.
- `ledger.ts` — the four atomic RPC wrappers that spent and refunded credits and
  tokens. `lib/points-wallet.ts` replaces it.
- `token-system-spec.md` — the written spec the two files implemented.
- `api-cron-token-convert/` — the nightly job that turned expiring credits into
  tokens. Points do not expire, so there is nothing to convert.
- `api-admin-tokens/` — granting and revoking tokens by hand. Replaced by the
  points adjustment on the member page.
- `api-admin-parent-credits/` — reading a family's remaining credits for the
  admin booking screen. Replaced by `/api/parent/wallet` and the admin quote in
  `/api/admin/bookings/bulk-create`.

**The database tables are still there.** `lesson_credits` and `token_packages`
were deliberately left untouched by `docs/migration-points-system.sql`, so the
tag `v1.0-packages` can be checked out and will still find its data. Do not drop
them without deciding that going back is off the table.
