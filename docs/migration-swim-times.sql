-- 成績: each swimmer's timed swims (owner, 2026-11-17).
-- Lesson tests: a coach adds seconds to a lesson report; they wait with the
-- report and go live when an admin confirms it (swim_times.status).
-- Meet results: meet_* (the 2026-11-16 meet, archived from manta-meet);
-- an admin links each meet swimmer to a student and publishes the meet.
-- Server only: RLS on, no policies (the routes use the service key).
-- Run on BOTH projects (live uobflteojebscsfiortb and manta-dev). Safe to run twice.

-- The meet tables as on the live project (created there on 2026-11-17);
-- on manta-dev they do not exist yet.
create table if not exists public.meet_meets (
  id bigserial primary key,
  title text not null,
  meet_date date,
  lanes integer,
  age_bands text[],
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.meet_events (
  id bigserial primary key,
  meet_id bigint not null references public.meet_meets(id) on delete cascade,
  event_no integer not null,
  name text not null,
  age_lo integer,
  age_hi integer,
  unique (meet_id, event_no)
);
create table if not exists public.meet_swimmers (
  id bigserial primary key,
  meet_id bigint not null references public.meet_meets(id) on delete cascade,
  name text not null,
  gender text check (gender in ('M', 'F')),
  birthdate date,
  award text,
  student_id uuid references public.students(id) on delete set null,
  unique (meet_id, name)
);
create table if not exists public.meet_entries (
  id bigserial primary key,
  event_id bigint not null references public.meet_events(id) on delete cascade,
  swimmer_id bigint not null references public.meet_swimmers(id) on delete cascade,
  heat integer,
  lane integer,
  seed_cs integer,
  result_cs integer,
  unique (event_id, swimmer_id)
);
alter table public.meet_meets enable row level security;
alter table public.meet_events enable row level security;
alter table public.meet_swimmers enable row level security;
alter table public.meet_entries enable row level security;

-- What each meet event is, so it sits beside the lesson tests:
-- 25 Yard Freestyle -> 25 / yd / free. Filled from the names below.
alter table public.meet_events add column if not exists distance integer;
alter table public.meet_events add column if not exists unit text;
alter table public.meet_events add column if not exists stroke text;
update public.meet_events set
  distance = coalesce(distance, substring(name from '(\d+)\s*(?:[Yy]ards?|[Yy]ds?|[Mm]eters?|[Mm])\M')::integer),
  unit = coalesce(unit, case when name ~* '\m(meter|m)\M' and name !~* 'yard' then 'm' else 'yd' end),
  stroke = coalesce(stroke, case
    when name ~* 'kick' then 'free_kick'
    when name ~* 'back' then 'back'
    when name ~* 'breast' then 'breast'
    when name ~* 'fly|butterfly' then 'fly'
    when name ~* '\mIM\M|medley' then 'im'
    when name ~* 'free' then 'free'
  end);
-- Families see a meet's times only once the desk publishes it.
alter table public.meet_meets add column if not exists published boolean not null default false;
create index if not exists meet_swimmers_student_idx on public.meet_swimmers(student_id);

create table if not exists public.swim_times (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  -- The lesson, as progress_history.lesson_key (lesson_group_id or class_session_id).
  lesson_key uuid,
  coach_id uuid references public.coaches(id) on delete set null,
  distance integer not null check (distance between 5 and 1500),
  unit text not null default 'yd' check (unit in ('yd', 'm')),
  stroke text not null check (stroke in ('free', 'back', 'breast', 'fly', 'im', 'free_kick')),
  time_cs integer not null check (time_cs between 100 and 99999),
  swum_on date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists swim_times_student_idx on public.swim_times(student_id, status);
create index if not exists swim_times_lesson_idx on public.swim_times(student_id, lesson_key);
alter table public.swim_times enable row level security;

notify pgrst, 'reload schema';
