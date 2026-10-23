-- 2026-10-23  只能看的家人（1 位全部權限 + 最多 2 位只能看）
--
-- Owner, 2026-10-23: besides the one full-rights second guardian, a family
-- may add up to two view-only members. They see the schedule and the
-- swimmers' learning (records, reports, learning map, monthly report,
-- certificates), may chat and check a swimmer in, and get only the lesson
-- emails. No points, no payments, no booking, cancelling or moving, no
-- account changes. lib/guardians.ts, familyOf() in lib/api-auth.ts.
--
-- 1. parent_guardians.role: 'full' (as before) or 'viewer'. Every existing
--    guardian stays 'full'.
-- 2. my_family_role(): 'main' / 'full' / 'viewer' for the signed-in person,
--    so pages can leave out what a viewer cannot do.
-- 3. my_paying_parent_id(): the family for the main account and a full
--    guardian only. The browser's reads of points, credits and invoices, and
--    its one write to the family row (language / newsletter / last seen), now
--    use it, so a viewer's browser gets nothing back from those tables even
--    when asked directly. Everything else (lessons, swimmers, reports, chat)
--    keeps my_parent_id(), which still includes viewers.
--
-- Run it all at once (one transaction). Safe to run more than once.

begin;

alter table public.parent_guardians
  add column if not exists role text not null default 'full';
do $$ begin
  alter table public.parent_guardians
    add constraint parent_guardians_role_check check (role in ('full', 'viewer'));
exception when duplicate_object then null; end $$;

create or replace function public.my_family_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'main' from public.parents where auth_user_id = auth.uid()
  union all
  select role from public.parent_guardians
   where auth_user_id = auth.uid() and removed_at is null
  limit 1
$$;
revoke all on function public.my_family_role() from public, anon;
grant execute on function public.my_family_role() to authenticated;

create or replace function public.my_paying_parent_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.parents where auth_user_id = auth.uid()
  union all
  select parent_id from public.parent_guardians
   where auth_user_id = auth.uid() and removed_at is null and role = 'full'
  limit 1
$$;
revoke all on function public.my_paying_parent_id() from public, anon;
grant execute on function public.my_paying_parent_id() to authenticated;

-- points, credits, invoices: main account and full guardian only
drop policy if exists "point_wallets_own_read" on public.point_wallets;
create policy "point_wallets_own_read" on public.point_wallets for select to authenticated
  using (parent_id = (select public.my_paying_parent_id()));
drop policy if exists "point_ledger_own_read" on public.point_ledger;
create policy "point_ledger_own_read" on public.point_ledger for select to authenticated
  using (parent_id = (select public.my_paying_parent_id()));
drop policy if exists "parents_read_own_credits" on public.lesson_credits;
create policy "parents_read_own_credits" on public.lesson_credits for select to authenticated
  using (parent_id = (select public.my_paying_parent_id())
         or student_id in (select id from public.students where parent_id = (select public.my_paying_parent_id())));
drop policy if exists "Parents can view own invoices" on public.invoices;
create policy "Parents can view own invoices" on public.invoices for select to authenticated
  using (parent_id = (select public.my_paying_parent_id()));

-- the family row: a viewer reads it but changes nothing on it
drop policy if exists "Parents can update own record" on public.parents;
create policy "Parents can update own record" on public.parents for update to authenticated
  using (id = (select public.my_paying_parent_id()));

commit;

-- Check (should show role, and 4 + 1 policies using my_paying_parent_id):
select column_name, column_default from information_schema.columns
 where table_schema = 'public' and table_name = 'parent_guardians' and column_name = 'role';
select tablename, policyname from pg_policies
 where schemaname = 'public' and (qual ilike '%my_paying_parent_id%' or with_check ilike '%my_paying_parent_id%')
 order by tablename;
