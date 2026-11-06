-- 2026-11-06  家人帳號讀不到健康、上課須知、地址、緊急聯絡人和櫃台備註
--
-- 14-role test 2, J01: a view-only family member's phone downloaded every
-- column of the family's students and parents rows (the page read '*', and
-- RLS lets every family member read those rows), so health notes, lesson
-- needs, the home address, the emergency contact and the desk's notes went
-- to his phone although the screens say only coaches and the desk see them.
--
-- Now a login (anon / authenticated) may read only the other columns. The
-- server (service role) reads everything as before; /api/parent/safety hands
-- the safety answers to the main account and a full guardian only, and the
-- admin pages read the address with the service role.
--
-- The column list is built from what the table has, so this file can run on
-- both projects and again later. A column added to students or parents
-- later is NOT readable by a login until this is run again (or granted by
-- hand) -- that is the point: new columns start private.
--
-- Run on BOTH projects (live and manta-dev). Safe to run more than once.

do $$
declare cols text;
begin
  revoke select on public.students from anon, authenticated;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'students'
     and column_name not in ('medical_notes', 'medical_confirmed_at', 'support_notes');
  execute format('grant select (%s) on public.students to anon, authenticated', cols);

  revoke select on public.parents from anon, authenticated;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'parents'
     and column_name not in ('street_address', 'address_line1', 'address_line2', 'city', 'state', 'zip_code',
                             'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
                             'notes', 'stripe_customer_id');
  execute format('grant select (%s) on public.parents to anon, authenticated', cols);
end $$;

-- 檢查：下面應該是 0 列（家人帳號讀不到這些欄位）
select table_name, column_name
from information_schema.column_privileges
where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'SELECT'
  and (table_name, column_name) in (
    ('students', 'medical_notes'), ('students', 'support_notes'),
    ('parents', 'address_line1'), ('parents', 'emergency_contact_phone'), ('parents', 'notes'));
