-- 2026-10-28  App 聊天改版：學校公告、通知紀錄、照片（owner）
-- Run on BOTH projects: production (uobflteojebscsfiortb) and manta-dev.

-- 1) Announcements the desk writes (Admin > 公告). Read through the server only.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  location_id text references public.locations(id) on delete set null,
  pinned boolean not null default false,
  expires_at timestamptz,
  pushed_at timestamptz,
  push_count int,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.announcements enable row level security;
create index if not exists announcements_created_idx on public.announcements (created_at desc) where deleted_at is null;

-- 2) What the school told each person: the 通知 tab, and the event strips in the chat.
create table if not exists public.push_log (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  url text,
  created_at timestamptz not null default now()
);
alter table public.push_log enable row level security;
create index if not exists push_log_user_idx on public.push_log (auth_user_id, created_at desc);
create index if not exists push_log_created_idx on public.push_log (created_at);

-- 3) When each person last opened 學校公告 and 通知 (the red dots).
create table if not exists public.app_inbox_seen (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  announcements_seen_at timestamptz,
  notices_seen_at timestamptz
);
alter table public.app_inbox_seen enable row level security;

-- 4) The fourth switch: school news and events. OFF until the person turns it on (Apple 4.5.4).
alter table public.push_settings add column if not exists news boolean not null default false;

-- 5) Photos parents send in the chat. Private; served through the server.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

notify pgrst, 'reload schema';
