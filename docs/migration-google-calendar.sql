-- 2026-11-03  Google 日曆：用 Google 登入同步課表（owner）
-- Run on BOTH projects: production (uobflteojebscsfiortb) and manta-dev.
--
-- One row per person who connected their Google Calendar (lib/google-calendar.ts):
-- the refresh token Google gave us and the "Manta Shark 課程" calendar we made in
-- their account. Server only: RLS on, no policies.

create table if not exists public.google_calendar_links (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  auth_user_id uuid not null unique,
  refresh_token text not null,
  calendar_id text,
  synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists google_calendar_links_parent on public.google_calendar_links (parent_id);
alter table public.google_calendar_links enable row level security;
revoke all on public.google_calendar_links from anon, authenticated;
