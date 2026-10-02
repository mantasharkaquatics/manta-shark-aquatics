-- Make-up voucher window (owner, 2026-10-02)
--
-- 1. A fixed-class LEAVE voucher is for a make-up within 14 days before or
--    after the missed lesson: usable_from = missed date - 14, expires_on =
--    missed date + 14. Other vouchers (grace, moved, admin, end of term) keep
--    usable_from NULL: usable at once, four weeks.
-- 2. A make-up cancelled 24 hours or more ahead gives its voucher back with
--    the original dates; if fewer than 7 days are left it is extended to 7 days
--    from the cancellation, ONCE per voucher. extended_at records that it has
--    happened.
--
-- Run once in the Supabase SQL editor. Safe to run again.

alter table public.make_up_vouchers add column if not exists usable_from date;
alter table public.make_up_vouchers add column if not exists extended_at timestamptz;

alter table public.make_up_vouchers drop constraint if exists make_up_vouchers_window_check;
alter table public.make_up_vouchers
  add constraint make_up_vouchers_window_check check (usable_from is null or usable_from <= expires_on);

-- Checks: both should be true.
select
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'make_up_vouchers' and column_name = 'usable_from') as has_usable_from,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'make_up_vouchers' and column_name = 'extended_at') as has_extended_at;
