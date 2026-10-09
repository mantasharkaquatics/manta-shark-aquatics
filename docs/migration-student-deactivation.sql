-- 2026-10-09  Who deactivated a swimmer, and when
--
-- Safe to run more than once, and safe to run before or after the code: the
-- Admin > Members switch works without these columns, it just cannot record.
--
-- students.deactivated_at / deactivated_by -- set by /api/admin/students/active
-- when a manager deactivates a swimmer, cleared when they are reactivated.
-- deactivated_by is the admin's id (admins.id). A swimmer deactivated before
-- this existed shows "deactivated" with no date or name.

alter table public.students add column if not exists deactivated_at timestamptz;
alter table public.students add column if not exists deactivated_by uuid references public.admins(id) on delete set null;

-- Check: the two columns, and every swimmer currently deactivated.
select id, full_name, is_active, deactivated_at, deactivated_by
from public.students
where is_active = false;
