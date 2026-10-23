-- 2026-10-23  追蹤名單：評估後提醒信、暑期報名提醒
--
-- Owner, 2026-10-23 (lib/follow-ups.ts): one row per follow-up email a family
-- was sent, so none goes twice.
--   kind 'assess_3' / 'assess_14', ref = student_assessments.id
--       (day 3 and day 14 after the assessment, nothing booked yet)
--   kind 'summer', ref = '<parent id>:<year>'
--       (the summer registration email the owner sends from Admin > Follow-ups)
--
-- Server-only (RLS on, no policies). Safe to run more than once.

create table if not exists public.family_notices (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  unique (kind, ref)
);

alter table public.family_notices enable row level security;
revoke all on public.family_notices from anon, authenticated;

-- Check (1 row):
-- select table_name from information_schema.tables where table_schema = 'public' and table_name = 'family_notices';
