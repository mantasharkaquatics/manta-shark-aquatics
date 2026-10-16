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
-- students.is_account_holder -- three values, and the third matters:
--   true  = this swimmer is the parent account's own person (at most one
--           active swimmer per family);
--   false = said not to be (box left unticked on a new swimmer, a minor, or
--           the desk unticked it) -- never "you" on the card;
--   null  = nobody has said (every swimmer that exists today). Only these
--           fall back to the name match, and only when the family has exactly
--           one adult swimmer and nobody in it is marked true.
-- Nullable with NO default on purpose: a default of false would turn every
-- existing swimmer into "said not to be".
-- Written only by server routes with the service role:
--   /api/auth/complete-registration, /api/parent/students (true or false for
--   every new swimmer), /api/admin/members/contact-change (set_account_holder).
-- Setting true on one swimmer sets the family's others that were true to
-- false first; the partial unique index below backs that up.

alter table public.students
  add column if not exists is_account_holder boolean;

-- At most one ACTIVE swimmer per family is the account holder. A deactivated
-- swimmer keeps its value and does not count; null and false do not count.
create unique index if not exists students_one_account_holder
  on public.students (parent_id)
  where is_account_holder and is_active;

-- The browser cannot write students at all (docs/migration-revoke-parent-writes.sql
-- revoked it at table level). Said again for this column, in case a column
-- grant was ever made on its own. SELECT is left alone.
revoke insert (is_account_holder), update (is_account_holder) on table public.students from anon, authenticated;

-- PostgREST must see the new column before the site can read or write it.
notify pgrst, 'reload schema';

-- 檢查 1：應該有 1 列：is_account_holder / boolean / YES / （空白，沒有預設值）
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

-- 檢查 4：剛執行完時，現有學員應該全部是「未設定」：marked_true 0、marked_false 0
select count(*) filter (where is_account_holder) as marked_true,
       count(*) filter (where is_account_holder = false) as marked_false,
       count(*) filter (where is_account_holder is null) as not_set
from public.students;
