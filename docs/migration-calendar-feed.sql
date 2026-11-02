-- 2026-11-02  課表訂閱到行事曆（owner）
-- Run on BOTH projects: production (uobflteojebscsfiortb) and manta-dev.
--
-- One private link per family. Google Calendar or the iPhone subscribes to it
-- and reads all the family's lessons from it again and again, so new lessons
-- appear, cancelled ones disappear and moved ones move, with no duplicates.
-- fetched_at: the last time a calendar read it; a family read in the last
-- 14 days gets no .ics file in its lesson emails (the same lesson would show
-- twice). Server only: RLS on, no policies.

create table if not exists public.calendar_feeds (
  parent_id uuid primary key references public.parents(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  fetched_at timestamptz
);
alter table public.calendar_feeds enable row level security;
revoke all on public.calendar_feeds from anon, authenticated;
