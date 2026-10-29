-- 2026-10-29  App 首頁的 3D 游泳小人：students.avatar_look
--
-- Run on BOTH databases (production uobflteojebscsfiortb and manta-dev).
-- Safe to run more than once, and safe to run before or after the code is
-- deployed: until it runs, the app's cards show each swimmer's starting look
-- and "Change look" says it could not save.
--
-- What it is (owner, 2026-10-29): inside the app, each swimmer's home card
-- shows a 3D cartoon swimmer the family can dress -- boy/girl, hair, swimsuit,
-- goggles, cap, fins and colours. The choice is kept here, one small JSON
-- object per swimmer (lib/swimmer-look.ts lists every allowed value; the
-- server refuses anything else).
--   null = never changed: the card starts from students.gender.
-- Written only by POST /api/parent/swimmer-look with the service role. Anyone
-- in the family may change it, view-only members included (owner). Families
-- read it with the rest of their swimmers' row (the existing RLS select).

alter table public.students add column if not exists avatar_look jsonb;

comment on column public.students.avatar_look is
  'The app''s 3D swimmer look (lib/swimmer-look.ts). Written only by /api/parent/swimmer-look.';

-- The browser cannot write students (docs/migration-revoke-parent-writes.sql);
-- said again for the new column so a later grant cannot open it by accident.
revoke insert (avatar_look), update (avatar_look) on table public.students from anon, authenticated;

-- Check: one row, jsonb.
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'students' and column_name = 'avatar_look';
