-- 2026-10-26  Paper level-up certificates: printed at the desk, handed over
--
-- Owner, 2026-10-26: the desk prints each level-up certificate and gives it
-- to the swimmer; Admin > Certificates lists the ones not handed over yet,
-- with a number on the menu. This records when (and by which admin) it was
-- handed over. Server-only: level_upgrades is read and written with the
-- service role.
--
-- Safe to run more than once.

alter table public.level_upgrades
  add column if not exists certificate_given_at timestamptz,
  add column if not exists certificate_given_by uuid references public.admins(id) on delete set null;

-- Check: two new columns.
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'level_upgrades' and column_name like 'certificate_%';
