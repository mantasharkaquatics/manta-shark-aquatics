-- 2026-10-22  安全資訊：學員醫療/過敏、家庭緊急聯絡人、場館電話與到場說明，AI 轉真人通知節流
--
-- Owner, 2026-10-22 (tier-1 review items 1, 2 and 4):
--   * every swimmer answers "no known medical conditions or allergies" or
--     describes them; students.medical_notes already exists, medical_confirmed_at
--     records that the question was answered (null = never asked);
--   * every family names one emergency contact; parents.emergency_contact_name
--     and _phone already exist, the relationship is new;
--   * the pool's phone and arrival notes ("enter from the north gate, park
--     in lot B") sit with its address, shown only to families with a booking;
--   * the address, map link, phone, arrival notes and check-in point are
--     no longer readable with the public (publishable) key: only the names.
--     The server reads them with the service role and sends them only to
--     families with a booking;
--   * an AI hand-off alerts the managers at most once per conversation every
--     30 minutes: chat_threads.staff_alerted_at.
--
-- Safe to run more than once. Run it BEFORE deploying the code that uses it.

alter table public.students  add column if not exists medical_confirmed_at timestamptz;
alter table public.parents   add column if not exists emergency_contact_relation text;
alter table public.locations add column if not exists phone text;
alter table public.locations add column if not exists directions text;
alter table public.chat_threads add column if not exists staff_alerted_at timestamptz;

-- 地址只給已預約的家庭：公開金鑰（anon / 已登入）只能讀場館名稱
revoke select on public.locations from anon, authenticated;
grant select (id, name, sort_order, is_active) on public.locations to anon, authenticated;

-- 檢查：應該是 5 列
select table_name || '.' || column_name as added
from information_schema.columns
where table_schema = 'public'
  and (table_name, column_name) in (
    ('students', 'medical_confirmed_at'),
    ('parents', 'emergency_contact_relation'),
    ('locations', 'phone'),
    ('locations', 'directions'),
    ('chat_threads', 'staff_alerted_at'))
order by 1;

-- 檢查：公開金鑰讀得到的欄位，應該只有 id, name, is_active, sort_order
select string_agg(column_name, ', ' order by column_name) as public_columns
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'locations'
  and grantee = 'anon' and privilege_type = 'SELECT';
