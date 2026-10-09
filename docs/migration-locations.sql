-- 2026-10-09  Two locations: Brea and Monrovia
--
-- Safe to run more than once, and safe to run BEFORE the code that uses it is
-- deployed: everything that exists today becomes Brea, and the code running
-- now never sees a difference.
--
-- 1. public.locations -- one row per pool. is_active = families can see and
--    book it. Monrovia starts hidden; Admin > Locations turns it on.
--
-- 2. coach_availability_zones.location_id -- each painted block of a coach's
--    hours belongs to one pool. Existing blocks are Brea (column default).
--
-- 3. class_sessions.location_id -- where the lesson is. Nobody sets it by
--    hand: the trigger below copies it from the coach's zone that covers the
--    lesson's start (a date override wins over the weekly template, the same
--    rule as lib/zones.ts getEffectiveZones). A lesson outside every zone (desk
--    override) takes the nearest zone that day, and a coach with no zones at
--    all is Brea. Moving a lesson to another coach, date or time re-runs it.
--    The column has NO default on purpose: a default is applied before a
--    BEFORE trigger runs, so the trigger could not tell "not given" from Brea.

begin;

create table if not exists public.locations (
  id          text primary key,
  name        text not null,
  address     text,
  map_url     text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.locations (id, name, address, sort_order, is_active) values
  ('brea',     'Brea',     null,       1, true),
  ('monrovia', 'Monrovia', 'Monrovia', 2, false)
on conflict (id) do nothing;

-- Families read pool names and addresses (booking page, lesson cards); only
-- the server (service role) writes.
alter table public.locations enable row level security;
drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations for select to anon, authenticated using (true);
revoke insert, update, delete, truncate on public.locations from anon, authenticated;
grant select on public.locations to anon, authenticated;

alter table public.coach_availability_zones
  add column if not exists location_id text not null default 'brea' references public.locations(id);

alter table public.class_sessions
  add column if not exists location_id text references public.locations(id);
update public.class_sessions set location_id = 'brea' where location_id is null;
alter table public.class_sessions alter column location_id drop default;

create or replace function public.class_session_location() returns trigger
language plpgsql as $$
declare
  has_date boolean;
  loc text;
begin
  if tg_op = 'INSERT' and new.location_id is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.location_id is distinct from old.location_id then
      return new;
    end if;
    if new.coach_id is not distinct from old.coach_id
       and new.session_date is not distinct from old.session_date
       and new.start_time is not distinct from old.start_time then
      return new;
    end if;
  end if;

  select exists (
    select 1 from public.coach_availability_zones
    where coach_id = new.coach_id and kind = 'date' and override_date = new.session_date::date
  ) into has_date;

  select z.location_id into loc
  from public.coach_availability_zones z
  where z.coach_id = new.coach_id
    and z.zone_type <> 'closed'
    and ((has_date and z.kind = 'date' and z.override_date = new.session_date::date)
      or (not has_date and z.kind = 'weekly' and z.weekday = extract(dow from new.session_date::date)::int))
  order by
    case when z.start_time::time <= new.start_time::time and new.start_time::time < z.end_time::time then 0 else 1 end,
    least(abs(extract(epoch from (z.start_time::time - new.start_time::time))),
          abs(extract(epoch from (z.end_time::time - new.start_time::time))))
  limit 1;

  new.location_id := coalesce(loc, 'brea');
  return new;
end $$;

drop trigger if exists class_sessions_location on public.class_sessions;
create trigger class_sessions_location
  before insert or update of coach_id, session_date, start_time, location_id
  on public.class_sessions
  for each row execute function public.class_session_location();

alter table public.class_sessions alter column location_id set not null;

create index if not exists class_sessions_location_date_idx
  on public.class_sessions (location_id, session_date);

commit;

-- Check: two pools, every zone and every lesson has one.
select
  (select string_agg(id || case when is_active then '' else ' (hidden)' end, ', ' order by sort_order) from public.locations) as locations,
  (select count(*) from public.coach_availability_zones where location_id is null) as zones_missing,
  (select count(*) from public.class_sessions where location_id is null) as lessons_missing,
  (select count(*) from public.class_sessions where location_id = 'brea') as brea_lessons;
