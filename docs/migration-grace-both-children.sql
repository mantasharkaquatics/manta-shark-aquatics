-- One monthly grace per child, for BOTH children of a sibling 1-on-2
-- (found 2026-10-07).
--
-- A sibling 1-on-2's grace voucher names both children (student_id = A,
-- student2_id = B) and uses both children's grace (owner, 2026-10-03). The
-- unique index make_up_vouchers_one_grace_a_month only covers
-- (student_id, grace_month), so the database protected the first child only:
-- two late cancels sent at the same moment -- the 1-on-2 from A's row and B's
-- own 1-on-4 -- both passed graceUsedThisMonth (a read, then a write in
-- lib/bookings/cancel.ts) and both inserted, giving B two graces in one month.
--
-- A plain unique index cannot say "this child appears at most once across
-- two columns", and a second index on (student2_id, grace_month) would still
-- let the case above through (B is student2 in one row and student_id in the
-- other). So this is a trigger: before a grace voucher is written it takes a
-- transaction lock per child and month (in a fixed order, so two inserts
-- cannot deadlock), then refuses the row if either child already has a grace
-- voucher that month in either column. The second of two simultaneous inserts
-- waits for the first to commit and then sees it.
--
-- It raises SQLSTATE 23505 (unique_violation), which lib/vouchers.ts
-- issueVoucher already reads as `duplicate`, and cancel.ts already turns into
-- NO_GRACE_LEFT with the lesson put back. No code change is needed; until this
-- runs, the old (first-child-only) protection stays as it is.
--
-- Like the unique index, it counts every grace voucher of the month whatever
-- its status (graceUsedThisMonth does the same).

-- 1. Pre-check: children who ALREADY have more than one grace in a month
--    across the two columns. Rows here are past double-uses for a person to
--    look at; the trigger does not touch existing rows.
with uses as (
  select student_id as child, grace_month, id from public.make_up_vouchers where grace_month is not null
  union all
  select student2_id, grace_month, id from public.make_up_vouchers where grace_month is not null and student2_id is not null
)
select child, grace_month, count(*) as graces, array_agg(id) as voucher_ids
from uses
group by child, grace_month
having count(*) > 1
order by grace_month, child;

-- 2. The change.
begin;

create or replace function public.make_up_vouchers_one_grace_per_child()
returns trigger
language plpgsql
as $$
declare
  kids uuid[];
  kid uuid;
begin
  if new.grace_month is null then
    return new;
  end if;
  kids := array(select distinct k from unnest(array[new.student_id, new.student2_id]) as k where k is not null order by k);
  foreach kid in array kids loop
    perform pg_advisory_xact_lock(hashtextextended('msa-grace:' || kid::text || ':' || new.grace_month::text, 0));
  end loop;
  if exists (
    select 1 from public.make_up_vouchers v
    where v.id is distinct from new.id
      and v.grace_month = new.grace_month
      and (v.student_id = any(kids) or v.student2_id = any(kids))
  ) then
    raise exception 'This child has already used this month''s grace'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists make_up_vouchers_one_grace_per_child on public.make_up_vouchers;
create trigger make_up_vouchers_one_grace_per_child
  before insert or update of grace_month, student_id, student2_id on public.make_up_vouchers
  for each row execute function public.make_up_vouchers_one_grace_per_child();

commit;

-- 3. Verification: the trigger exists and is enabled ('O').
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.make_up_vouchers'::regclass
  and tgname = 'make_up_vouchers_one_grace_per_child';
