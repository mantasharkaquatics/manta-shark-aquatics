-- 2026-10-05  註冊改由伺服器建立家長資料（app/api/auth/complete-registration）
--
-- Why: the register page checked the email and SMS codes in the browser only,
-- then inserted the parents row from the browser too. Two calls from the
-- console (auth signUp + insert) registered a stranger's email, or a phone
-- that was never verified -- which then got our SMS reminders with no A2P
-- opt-in behind it.
--
-- The new route only creates the family after it finds a verified, recent,
-- unused phone_otps row and email_otps row, and it marks both used. This file:
--
--   1. phone_otps / email_otps: used_at + used_by, so a code proves ONE sign-up.
--      Also makes sure RLS is on with no policies (platform convention: only
--      the service role reads these; they hold live login codes).
--   2. parents: the signed-in browser can no longer INSERT. Only the service
--      role (the route) creates family rows.
--   3. parents: the browser may UPDATE only the four columns the site really
--      changes from the browser (language, newsletter, last login, last
--      activity). Without this a family could register with its own verified
--      phone and then UPDATE the row to someone else's number.
--      Email and phone changes already go through the admin contact-change
--      route with the service key.
--
-- ORDER: deploy the code FIRST, then run this. The old register page inserts
-- parents from the browser, and after step 2 that insert is refused.
--
-- If a browser page is ever added that updates another parents column, it
-- will fail with "permission denied for table parents": add the column to the
-- grant in step 3, or do the write in an API route.

begin;

-- 1. One sign-up per code ---------------------------------------------------
alter table public.phone_otps
  add column if not exists used_at timestamptz,
  add column if not exists used_by uuid;   -- auth.users.id of the account that used it
alter table public.email_otps
  add column if not exists used_at timestamptz,
  add column if not exists used_by uuid;

-- The route's lookup: newest verified row for this phone / email.
create index if not exists phone_otps_phone_created_idx on public.phone_otps (phone, created_at desc);
create index if not exists email_otps_email_created_idx on public.email_otps (email, created_at desc);

alter table public.phone_otps enable row level security;
alter table public.email_otps enable row level security;

-- 2. No direct INSERT into parents from the browser -------------------------
-- A table privilege, not a policy: it holds whatever INSERT policies exist
-- (their names are not in this repo; the check at the end lists them).
revoke insert on table public.parents from anon, authenticated;

-- 3. Browser UPDATE limited to these columns --------------------------------
-- Used by: components/Navbar.tsx (preferred_language), dashboard/account
-- (newsletter_subscribed, last_activity_at), login page (last_login_at).
-- The existing UPDATE policy still decides WHICH row; this decides which
-- columns.
revoke update on table public.parents from anon, authenticated;
grant update (preferred_language, newsletter_subscribed, last_login_at, last_activity_at)
  on table public.parents to authenticated;

commit;

-- 檢查：每一列 ok 都應該是 true
select 'phone_otps.used_at' as item,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'phone_otps' and column_name = 'used_at') as ok
union all
select 'email_otps.used_at',
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'email_otps' and column_name = 'used_at')
union all
select 'phone_otps RLS 開啟', (select relrowsecurity from pg_class where oid = 'public.phone_otps'::regclass)
union all
select 'email_otps RLS 開啟', (select relrowsecurity from pg_class where oid = 'public.email_otps'::regclass)
union all
select 'authenticated 不能 INSERT parents', not has_table_privilege('authenticated', 'public.parents', 'INSERT')
union all
select 'anon 不能 INSERT parents', not has_table_privilege('anon', 'public.parents', 'INSERT')
union all
select 'authenticated 不能改 parents.phone', not has_column_privilege('authenticated', 'public.parents', 'phone', 'UPDATE')
union all
select 'authenticated 不能改 parents.email', not has_column_privilege('authenticated', 'public.parents', 'email', 'UPDATE')
union all
select 'authenticated 可改 parents.preferred_language', has_column_privilege('authenticated', 'public.parents', 'preferred_language', 'UPDATE')
union all
select 'service_role 仍可 INSERT parents', has_table_privilege('service_role', 'public.parents', 'INSERT');

-- 參考：parents 目前的 policy（INSERT 那條已經沒有作用，可以留著或之後刪）
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('parents', 'phone_otps', 'email_otps')
order by tablename, cmd, policyname;
