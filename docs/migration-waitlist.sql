-- 2026-10-22  候補名單（泳隊、一對四團體班、指定教練的時段）
--
-- Owner, 2026-10-22 (tier 2): a family can join a waitlist for a full Swim
-- Team squad, a full 1-on-4 class, or a coach's time that is already taken.
-- When a place opens, only the first family in line is told (email + text)
-- and the place is held for them for 12 hours (2 hours when the lesson is
-- less than 24 hours away); if they do not book, it goes to the next family.
-- lib/waitlist.ts. Server only: RLS on, no policies.
--
-- Safe to run more than once.

create table if not exists public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.parents(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  kind text not null check (kind in ('team', 'group', 'slot')),
  team_tier_id uuid references public.team_tiers(id) on delete cascade,
  class_session_id uuid references public.class_sessions(id) on delete cascade,
  coach_id uuid references public.coaches(id) on delete cascade,
  course_type_id uuid references public.course_types(id),
  slot_date date,
  slot_start time,
  minutes integer,
  status text not null default 'waiting' check (status in ('waiting', 'offered', 'booked', 'expired', 'left')),
  offered_at timestamptz,
  offer_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_entries_live on public.waitlist_entries (status, kind, created_at);

-- One place in line per swimmer per thing they wait for.
create unique index if not exists waitlist_entries_one_live on public.waitlist_entries (
  student_id, kind,
  coalesce(team_tier_id, class_session_id, coach_id),
  coalesce(slot_date, date '1970-01-01'),
  coalesce(slot_start, time '00:00')
) where status in ('waiting', 'offered');

alter table public.waitlist_entries enable row level security;

-- 檢查：應該是 1 列
select table_name from information_schema.tables where table_schema = 'public' and table_name = 'waitlist_entries';
