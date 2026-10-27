-- Push notifications for the phone app (owner, 2026-10-27). lib/push.ts.
--
-- push_devices: one row per phone that installed the app and signed in. The
-- token is what Firebase (FCM) delivers to; it moves to whoever signed in on
-- that phone last. permission = the phone currently allows notifications.
-- last_seen_at is refreshed every time the app opens: a family "has the app"
-- (and gets a push instead of a text) only if the main account's phone was
-- seen within 60 days.
--
-- push_settings: the three switches in My Account (lesson reports, lesson
-- reminders, booking changes), per person. No row = all on. Closures and
-- lessons the school cancels are always sent and have no switch.
--
-- Server-only: RLS on, no policies. Run on BOTH projects (live and manta-dev).
-- Safe to run more than once.

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid not null references public.parents(id) on delete cascade,
  lang text not null default 'en',
  permission boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists push_devices_parent on public.push_devices (parent_id);
create index if not exists push_devices_user on public.push_devices (auth_user_id);
alter table public.push_devices enable row level security;

create table if not exists public.push_settings (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  reports boolean not null default true,
  reminders boolean not null default true,
  bookings boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.push_settings enable row level security;

notify pgrst, 'reload schema';
