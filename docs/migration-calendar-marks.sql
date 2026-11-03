-- 2026-11-03  行事曆按鈕的「已同步」標記（owner）
-- Run on BOTH projects: production (uobflteojebscsfiortb) and manta-dev.
--
-- 1. iPhone: each phone or computer gets its own subscribe link, so the
--    "✓" on 「iPhone 行事曆」 is about this phone, not the whole family.
--    fetched_at: the last time a calendar read that link. The family's old
--    link (calendar_feeds) keeps working for calendars already on it.
-- 2. Google: one login may connect up to 3 Google accounts (two phones on
--    the same login, each with its own Google). google_sub is Google's id
--    for the account (connecting the same one again keeps its calendar);
--    google_email is shown on the card so people know which one it is.
-- Server only: RLS on, no policies.

create table if not exists public.calendar_feed_devices (
  token text primary key,
  parent_id uuid not null references public.parents(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  fetched_at timestamptz,
  unique (parent_id, device_id)
);
alter table public.calendar_feed_devices enable row level security;
revoke all on public.calendar_feed_devices from anon, authenticated;

alter table public.google_calendar_links drop constraint if exists google_calendar_links_auth_user_id_key;
alter table public.google_calendar_links add column if not exists google_sub text;
alter table public.google_calendar_links add column if not exists google_email text;
create unique index if not exists google_calendar_links_user_sub on public.google_calendar_links (auth_user_id, google_sub);
create index if not exists google_calendar_links_user on public.google_calendar_links (auth_user_id);
