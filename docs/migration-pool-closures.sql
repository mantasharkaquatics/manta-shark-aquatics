-- 2026-10-23  一鍵全場停課（Admin > 停課）
--
-- Owner, 2026-10-23: when a pool has to close (weather, a power outage, the
-- water or equipment, the venue), the desk closes it for a day, several days
-- or part of one day in one step (/admin/closures, lib/closures.ts):
--   * every lesson at that pool in that time is cancelled, points / make-up
--     vouchers go back in full, and each family gets an email (and a text
--     when the lesson is within 48 hours);
--   * Swim Team families with a practice there then are told too (the
--     monthly fee does not change);
--   * the coaches' hours there are blocked (coach_time_off rows of type
--     'admin_block' carrying closure_id), so nobody can book into it;
--   * a banner sits at the top of every page until the closure ends or the
--     desk turns it off.
--
-- pool_closures is server-only (RLS on, no policies): the banner reads it
-- through /api/closures, which sends only what the banner shows.
--
-- Safe to run more than once.

create table if not exists public.pool_closures (
  id uuid primary key default gen_random_uuid(),
  location_id text not null references public.locations(id),
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  reason_key text not null check (reason_key in ('weather', 'power', 'water', 'venue', 'other')),
  reason_text text,
  banner_off_at timestamptz,
  reopened_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  result jsonb,
  constraint pool_closures_dates check (end_date >= start_date),
  constraint pool_closures_times check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and start_time < end_time and start_date = end_date)
  ),
  constraint pool_closures_other check (reason_key <> 'other' or length(trim(coalesce(reason_text, ''))) > 0)
);

alter table public.pool_closures enable row level security;
revoke all on public.pool_closures from anon, authenticated;

alter table public.coach_time_off
  add column if not exists closure_id uuid references public.pool_closures(id) on delete cascade;

create index if not exists coach_time_off_closure_id on public.coach_time_off (closure_id) where closure_id is not null;

-- Check (2 rows):
-- select table_name, column_name from information_schema.columns
--  where table_schema = 'public'
--    and ((table_name = 'pool_closures' and column_name = 'reason_key')
--      or (table_name = 'coach_time_off' and column_name = 'closure_id'));
