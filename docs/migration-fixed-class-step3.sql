-- Fixed class, step 3: renewal notice + change of slot (docs/fixed-class-spec.md 4, 5).
-- Run once in the Supabase SQL Editor. Safe to run again.

-- When the renewal email went out for the class's current last lesson.
-- Cleared when the family renews, so the next round gets its own email.
alter table public.fixed_classes add column if not exists renewal_notified_at timestamptz;

-- A make-up voucher can now also come from a change of slot: a lesson that
-- fitted neither the new slot nor another coach.
alter table public.make_up_vouchers drop constraint if exists make_up_vouchers_reason_check;
alter table public.make_up_vouchers add constraint make_up_vouchers_reason_check
  check (reason in ('leave', 'grace', 'admin', 'end_of_term', 'moved'));

-- Checks: both rows should say true.
select 'fixed_classes.renewal_notified_at' as check_name,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'fixed_classes' and column_name = 'renewal_notified_at') as ok
union all
select 'make_up_vouchers reason allows moved',
       coalesce((select pg_get_constraintdef(oid) like '%moved%' from pg_constraint
                 where conname = 'make_up_vouchers_reason_check'), false);
