-- 2026-10-22  第二位監護人（和主帳號一樣）＋ 兩個資料外洩漏洞
--
-- Owner, 2026-10-22 (tier 2): a family can add a second guardian. They get
-- their own login and the same rights as the main account -- book, cancel,
-- top up, the same points, every notice by email. Only the main account can
-- invite or remove them. lib/guardians.ts.
--
-- 1. parent_guardians: one row per guardian. Server only (RLS on, no
--    policies); the browser learns its family through my_parent_id().
-- 2. my_parent_id(): the family the signed-in person belongs to, as the main
--    account or as a live guardian. Every "own family" policy below now uses
--    it instead of parents.auth_user_id = auth.uid(), so a guardian reads and
--    writes exactly what the main account does. The parents row itself stays
--    writable only in the columns the browser was already granted
--    (newsletter, language, last login/activity).
-- 3. Two holes found while reading the policies (not guardian-related):
--    - progress_history: a policy named "service role full access" was
--      written for role public with USING (true), and another let anon and
--      every signed-in user read all approved reports. Together: anyone,
--      signed in or not, could read every swimmer's skill reports. Now a
--      family reads only its own swimmers' approved reports. (The service
--      role skips RLS, so it never needed a policy.)
--    - level_recommendations: the same "service role full access" policy
--      plus a SELECT grant let anyone read every coach recommendation. Only
--      server code reads that table; the browser loses access.
--
-- Run it all at once (one transaction). Safe to run more than once.

begin;

create table if not exists public.parent_guardians (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  auth_user_id uuid unique,
  email text not null,
  first_name text,
  last_name text,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists parent_guardians_parent on public.parent_guardians (parent_id);
create unique index if not exists parent_guardians_live_email
  on public.parent_guardians (lower(email)) where removed_at is null;
alter table public.parent_guardians enable row level security;
revoke all on public.parent_guardians from anon, authenticated;

create or replace function public.my_parent_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.parents where auth_user_id = auth.uid()
  union all
  select parent_id from public.parent_guardians
   where auth_user_id = auth.uid() and removed_at is null
  limit 1
$$;
revoke all on function public.my_parent_id() from public, anon;
grant execute on function public.my_parent_id() to authenticated;

-- bookings
drop policy if exists "Parents can insert bookings" on public.bookings;
create policy "Parents can insert bookings" on public.bookings for insert to authenticated
  with check (parent_id = (select public.my_parent_id()));
drop policy if exists "Parents can read own bookings" on public.bookings;
create policy "Parents can read own bookings" on public.bookings for select to authenticated
  using (parent_id = (select public.my_parent_id()));
drop policy if exists "parents_can_cancel_own_bookings" on public.bookings;
create policy "parents_can_cancel_own_bookings" on public.bookings for update to authenticated
  using (parent_id = (select public.my_parent_id()))
  with check (parent_id = (select public.my_parent_id()));

-- chat
drop policy if exists "parents_own_thread" on public.chat_threads;
create policy "parents_own_thread" on public.chat_threads for all to authenticated
  using (parent_id = (select public.my_parent_id()));
drop policy if exists "parents_own_messages" on public.chat_messages;
create policy "parents_own_messages" on public.chat_messages for all to authenticated
  using (thread_id in (select id from public.chat_threads where parent_id = (select public.my_parent_id())));

-- invoices, credits, points
drop policy if exists "Parents can view own invoices" on public.invoices;
create policy "Parents can view own invoices" on public.invoices for select to authenticated
  using (parent_id = (select public.my_parent_id()));
drop policy if exists "parents_read_own_credits" on public.lesson_credits;
create policy "parents_read_own_credits" on public.lesson_credits for select to authenticated
  using (parent_id = (select public.my_parent_id())
         or student_id in (select id from public.students where parent_id = (select public.my_parent_id())));
drop policy if exists "point_ledger_own_read" on public.point_ledger;
create policy "point_ledger_own_read" on public.point_ledger for select to authenticated
  using (parent_id = (select public.my_parent_id()));
drop policy if exists "point_wallets_own_read" on public.point_wallets;
create policy "point_wallets_own_read" on public.point_wallets for select to authenticated
  using (parent_id = (select public.my_parent_id()));

-- lesson notes
drop policy if exists "parents_read_approved_notes" on public.lesson_notes;
create policy "parents_read_approved_notes" on public.lesson_notes for select to authenticated
  using (status = 'approved'
         and student_id in (select id from public.students where parent_id = (select public.my_parent_id())));
drop policy if exists "parents_read_note_translations" on public.lesson_note_translations;
create policy "parents_read_note_translations" on public.lesson_note_translations for select to authenticated
  using (lesson_note_id in (
    select n.id from public.lesson_notes n
     where n.status = 'approved'
       and n.student_id in (select id from public.students where parent_id = (select public.my_parent_id()))));

-- partner families
drop policy if exists "parents can see own partnerships" on public.parent_partnerships;
create policy "parents can see own partnerships" on public.parent_partnerships for select to authenticated
  using ((select public.my_parent_id()) in (initiator_parent_id, partner_parent_id));
drop policy if exists "both parties can update" on public.parent_partnerships;
create policy "both parties can update" on public.parent_partnerships for update to authenticated
  using ((select public.my_parent_id()) in (initiator_parent_id, partner_parent_id));
drop policy if exists "parents can insert as initiator" on public.parent_partnerships;
create policy "parents can insert as initiator" on public.parent_partnerships for insert to authenticated
  with check (initiator_parent_id = (select public.my_parent_id()));

-- the family row (main-account policies "parents_self" / insert stay as they were)
drop policy if exists "Parents can read own record" on public.parents;
create policy "Parents can read own record" on public.parents for select to authenticated
  using (id = (select public.my_parent_id()));
drop policy if exists "Parents can update own record" on public.parents;
create policy "Parents can update own record" on public.parents for update to authenticated
  using (id = (select public.my_parent_id()));

-- swimmers
drop policy if exists "Parents can read own students" on public.students;
create policy "Parents can read own students" on public.students for select to authenticated
  using (parent_id = (select public.my_parent_id()));
drop policy if exists "Parents can update own students" on public.students;
create policy "Parents can update own students" on public.students for update to authenticated
  using (parent_id = (select public.my_parent_id()));
drop policy if exists "Parents can insert students" on public.students;
create policy "Parents can insert students" on public.students for insert to authenticated
  with check (parent_id = (select public.my_parent_id()));
drop policy if exists "students_insert" on public.students;
create policy "students_insert" on public.students for insert to authenticated
  with check (parent_id = (select public.my_parent_id()));
drop policy if exists "students_self" on public.students;
create policy "students_self" on public.students for all to authenticated
  using (parent_id = (select public.my_parent_id()));

-- hole 1: progress_history
drop policy if exists "service role full access" on public.progress_history;
drop policy if exists "fix5_browser_reads_approved_only" on public.progress_history;
drop policy if exists "parents_read_own_approved_history" on public.progress_history;
create policy "parents_read_own_approved_history" on public.progress_history for select to authenticated
  using (status = 'approved'
         and student_id in (select id from public.students where parent_id = (select public.my_parent_id())));
revoke select on public.progress_history from anon;

-- hole 2: level_recommendations
drop policy if exists "service role full access" on public.level_recommendations;
revoke all on public.level_recommendations from anon, authenticated;

commit;

-- Check (should list the guardian table and 0 rows for the last two):
-- select count(*) from public.parent_guardians;
-- select policyname from pg_policies where tablename in ('progress_history','level_recommendations') and qual = 'true';
