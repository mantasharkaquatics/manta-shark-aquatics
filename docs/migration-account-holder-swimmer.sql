-- 2026-10-16  「這位學員就是我」：students.is_account_holder（稽核 F15）
--
-- Safe to run more than once, and safe to run BEFORE or AFTER the code is
-- deployed: every read and write of the column tolerates it being absent.
-- Before this runs, the "this swimmer is me" box on registration and on
-- My Account is simply not stored, and the birthday card decides "is this
-- adult the account holder" by the name match alone (lib/account-holder.ts).
--
-- Why: an adult who registers and swims themselves was written about in the
-- third person on their own birthday card whenever their name did not match
-- word for word (Chinese names entered as 名字 / 姓氏 vs 姓名, nicknames).
-- The family now says so: one box per swimmer, at most one per family, only
-- for an adult (18+). Owner, 2026-10-16.
--
-- students.is_account_holder -- true on the one swimmer who is the parent
-- account's own person. Written only by server routes with the service role:
--   /api/auth/complete-registration, /api/parent/students,
--   /api/admin/members/contact-change (action set_account_holder).
-- Setting it on one swimmer clears it on the family's others first; the
-- partial unique index below backs that up for active swimmers.

alter table public.students
  add column if not exists is_account_holder boolean not null default false;

-- At most one ACTIVE swimmer per family is the account holder. A deactivated
-- swimmer keeps its value and does not count.
create unique index if not exists students_one_account_holder
  on public.students (parent_id)
  where is_account_holder and is_active;

-- The browser cannot write students at all (docs/migration-revoke-parent-writes.sql
-- revoked it at table level). Said again for this column, in case a column
-- grant was ever made on its own. SELECT is left alone.
revoke insert (is_account_holder), update (is_account_holder) on table public.students from anon, authenticated;

-- PostgREST must see the new column before the site can read or write it.
notify pgrst, 'reload schema';

-- 檢查 1：應該有 1 列：is_account_holder / boolean / NO / false
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'students' and column_name = 'is_account_holder';

-- 檢查 2：應該有 1 列（唯一索引已建立）
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'students' and indexname = 'students_one_account_holder';

-- 檢查 3：應該是「0 列」（沒有任何家庭有兩位以上的帳號本人學員）
select parent_id, count(*) as holders
from public.students
where is_account_holder and is_active
group by parent_id
having count(*) > 1;
