-- Coach PIN login: one row per attempt, so the endpoint can rate-limit a
-- client and so an attack is VISIBLE rather than silent.
--
-- Why keyed by ip_hash and not by coach: a wrong PIN matches nobody, so a
-- failed attempt cannot be attributed to an account. Only the caller can be
-- counted. coach_id is filled in on SUCCESS only, which is what also makes
-- this a "who signed in, from where" log.

create table if not exists public.coach_pin_attempts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  ip_hash     text not null,
  ok          boolean not null default false,
  coach_id    uuid references public.coaches(id) on delete set null,
  user_agent  text
);

-- The hot query is "failures from this ip in the last 15 minutes".
create index if not exists coach_pin_attempts_ip_time
  on public.coach_pin_attempts (ip_hash, created_at desc);
-- Used by the opportunistic purge of old rows.
create index if not exists coach_pin_attempts_time
  on public.coach_pin_attempts (created_at desc);

-- Platform convention: RLS on, zero policies. Only the service role reads it.
alter table public.coach_pin_attempts enable row level security;

-- Verify (want: true / 0)
-- select c.relname, c.relrowsecurity, count(p.polname)
-- from pg_class c left join pg_policy p on p.polrelid = c.oid
-- where c.relname = 'coach_pin_attempts' group by 1, 2;
