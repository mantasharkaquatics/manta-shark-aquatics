-- 2026-10-16  三個防重複的唯一索引（稽核 F104、F106、F115）
--
-- Safe to run any time, before or after a deploy, and more than once. The code
-- already treats the resulting 23505 (duplicate) errors as "already done".
-- Checked on production 2026-10-16: none of the three has duplicate rows today,
-- so every index builds. The first query re-checks that; all three counts
-- should be 0 before the indexes are created.
--
-- F104  one live Swim Assessment booking per swimmer.
-- F106  one Swim Team invoice mirror per Stripe payment.
-- F115  one birthday gift per swimmer per year (two overlapping cron runs).

select
  (select count(*) from (select student_id from public.bookings
     where is_trial and status <> 'cancelled'
     group by student_id having count(*) > 1) a) as dup_trials,
  (select count(*) from (select stripe_payment_intent_id from public.invoices
     where team_membership_id is not null and payment_method = 'stripe'
     group by stripe_payment_intent_id having count(*) > 1) b) as dup_team_invoices,
  (select count(*) from (select 1 from public.point_ledger
     where reason = 'birthday_gift'
     group by pricing->>'studentId', pricing->>'year' having count(*) > 1) c) as dup_birthday_gifts;

create unique index if not exists bookings_one_live_trial_per_student
  on public.bookings (student_id) where is_trial and status <> 'cancelled';

create unique index if not exists invoices_one_team_mirror
  on public.invoices (stripe_payment_intent_id)
  where team_membership_id is not null and payment_method = 'stripe';

create unique index if not exists point_ledger_birthday_once
  on public.point_ledger ((pricing->>'studentId'), (pricing->>'year'))
  where reason = 'birthday_gift';

-- 檢查：應該是 3 列
select indexname from pg_indexes
where schemaname = 'public'
  and indexname in ('bookings_one_live_trial_per_student', 'invoices_one_team_mirror', 'point_ledger_birthday_once');
