-- 2026-10-08  收回瀏覽器對 bookings / students 的寫入權限
--
-- RUN THIS ONLY AFTER THE CODE FROM THIS CHANGE IS DEPLOYED.
-- The old dashboard still writes to bookings from the browser, and the old
-- "My Account" page adds a swimmer from the browser; after this file runs,
-- both of those are refused ("permission denied for table ...").
--
-- Why: the owner's check on production (2026-10-08) showed the signed-in
-- browser role holding INSERT and UPDATE on every column of both tables
-- (bookings 34 columns, students 19; DELETE is table-level). With that a
-- family could, from the browser console:
--   - raise bookings.points_charged on one of its lessons and then cancel it,
--     and the refund (lib/bookings/refund.ts) pays back the raised number;
--   - set a pending assessment to 'confirmed' without paying;
--   - add a swimmer with a current_level, skipping the $85 assessment and the
--     level bands, or add a fourth and fifth swimmer.
--
-- After the code change nothing the site does writes these tables with the
-- user's session: every write is a server route using the service role,
-- which these privileges do not touch. The dashboard's browser "cleanup" of
-- expired invitations is gone (the cleanup job does it and emails both
-- families), and adding a swimmer goes through /api/parent/students.
--
-- SELECT is NOT revoked: the dashboard, the coach portal and the admin pages
-- read both tables from the browser, under the existing RLS policies.
--
-- The RLS policies for INSERT / UPDATE / DELETE on these tables (their names
-- are not in the repo) are left in place; without the privilege they no
-- longer let anything through. The last query below lists them, in case you
-- want to drop them later for tidiness.
--
-- Safe to run more than once.

begin;

-- 1. Table level. Per the PostgreSQL docs, revoking a table privilege also
--    revokes the same privilege on each column.
revoke insert, update, delete on table public.bookings from anon, authenticated;
revoke insert, update, delete on table public.students from anon, authenticated;

-- 2. Column level, explicitly, for any column grant made on its own
--    (columns have no DELETE privilege; SELECT is left alone).
do $$
declare r record;
begin
  for r in
    select c.relname, a.attname
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('bookings', 'students')
      and a.attnum > 0 and not a.attisdropped
  loop
    execute format('revoke insert (%I), update (%I) on table public.%I from anon, authenticated',
                   r.attname, r.attname, r.relname);
  end loop;
end $$;

commit;

-- 檢查 1：應該是「0 列」（沒有任何欄位還能被瀏覽器新增或修改）
-- If rows remain, the grantor column says which role granted them; a REVOKE
-- only takes back what the running role (or the table owner) granted.
select table_name, grantee, privilege_type, grantor, count(*) as columns
from information_schema.column_privileges
where table_schema = 'public'
  and table_name in ('bookings', 'students')
  and grantee in ('anon', 'authenticated', 'PUBLIC')
  and privilege_type in ('INSERT', 'UPDATE')
group by 1, 2, 3, 4
order by 1, 2, 3;

-- 檢查 2：應該是「0 列」（資料表層級也沒有新增／修改／刪除）
select table_name, grantee, privilege_type, grantor
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in ('bookings', 'students')
  and grantee in ('anon', 'authenticated', 'PUBLIC')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
order by 1, 2, 3;

-- 檢查 3：每一列 ok 都應該是 true
select 'authenticated cannot write bookings' as item,
       not (has_table_privilege('authenticated', 'public.bookings', 'INSERT')
         or has_table_privilege('authenticated', 'public.bookings', 'UPDATE')
         or has_table_privilege('authenticated', 'public.bookings', 'DELETE')
         or has_any_column_privilege('authenticated', 'public.bookings', 'INSERT')
         or has_any_column_privilege('authenticated', 'public.bookings', 'UPDATE')) as ok
union all
select 'authenticated cannot write students',
       not (has_table_privilege('authenticated', 'public.students', 'INSERT')
         or has_table_privilege('authenticated', 'public.students', 'UPDATE')
         or has_table_privilege('authenticated', 'public.students', 'DELETE')
         or has_any_column_privilege('authenticated', 'public.students', 'INSERT')
         or has_any_column_privilege('authenticated', 'public.students', 'UPDATE'))
union all
select 'anon cannot write bookings',
       not (has_table_privilege('anon', 'public.bookings', 'INSERT')
         or has_table_privilege('anon', 'public.bookings', 'UPDATE')
         or has_table_privilege('anon', 'public.bookings', 'DELETE')
         or has_any_column_privilege('anon', 'public.bookings', 'INSERT')
         or has_any_column_privilege('anon', 'public.bookings', 'UPDATE'))
union all
select 'anon cannot write students',
       not (has_table_privilege('anon', 'public.students', 'INSERT')
         or has_table_privilege('anon', 'public.students', 'UPDATE')
         or has_table_privilege('anon', 'public.students', 'DELETE')
         or has_any_column_privilege('anon', 'public.students', 'INSERT')
         or has_any_column_privilege('anon', 'public.students', 'UPDATE'))
union all
select 'authenticated can still READ bookings',  has_table_privilege('authenticated', 'public.bookings', 'SELECT')
union all
select 'authenticated can still READ students',  has_table_privilege('authenticated', 'public.students', 'SELECT')
union all
select 'service_role (server routes) can still write bookings',
       has_table_privilege('service_role', 'public.bookings', 'INSERT')
   and has_table_privilege('service_role', 'public.bookings', 'UPDATE')
   and has_table_privilege('service_role', 'public.bookings', 'DELETE')
union all
select 'service_role (server routes) can still write students',
       has_table_privilege('service_role', 'public.students', 'INSERT')
   and has_table_privilege('service_role', 'public.students', 'UPDATE')
   and has_table_privilege('service_role', 'public.students', 'DELETE');

-- 參考（不需要動作）：仍存在的寫入 policy。INSERT/UPDATE/DELETE 的已不再生效；
-- cmd = ALL 的同時管讀取，請保留。
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('bookings', 'students')
  and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
order by tablename, cmd, policyname;
