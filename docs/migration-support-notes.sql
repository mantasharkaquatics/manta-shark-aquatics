-- 2026-11-05  學員的「學習或感官需求」（選填）
--
-- Owner, 2026-11-05 (14-role app test, 決定 7 選項 A): the safety form asked
-- only about illness or allergy, so a family wrote an autistic child's needs
-- there and the account page labelled them 健康. Now an optional second
-- question: how to talk with the child, what upsets them, what helps them
-- settle. No diagnosis is asked.
--
--   students.support_notes  text, null = nothing written
--
-- Same readers as students.medical_notes: the family (RLS on students), the
-- coach for swimmers in their lessons and the desk (both through the server).
-- No new policy or grant is needed: the column inherits the table's.
--
-- Safe to run more than once. Run it on BOTH projects (live and manta-dev),
-- before or after deploying: without it the form saves everything else and
-- the server logs that the needs were not saved.

alter table public.students add column if not exists support_notes text;

-- 檢查：應該是 1 列 support_notes | text
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'students' and column_name = 'support_notes';
