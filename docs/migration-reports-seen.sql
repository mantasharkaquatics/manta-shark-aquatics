-- 2026-10-23  新的上課報告提醒
--
-- Owner, 2026-10-23: the dashboard shows a red count on a swimmer's "Lesson
-- records" button, and a line above the swimmers, for lesson reports a
-- manager approved after the family last opened that swimmer's records
-- (/api/parent/reports-seen). Reports approved before this ran count as seen;
-- a swimmer added later starts with none seen.
--
-- Safe to run more than once: the starting mark is set only when the column
-- is first added.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'students' and column_name = 'reports_seen_at'
  ) then
    alter table public.students add column reports_seen_at timestamptz;
    update public.students set reports_seen_at = now();
  end if;
end $$;

-- Check (1 row, and every existing swimmer has a mark):
-- select count(*) as swimmers, count(reports_seen_at) as marked from public.students;
