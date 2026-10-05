-- Per-network rate limit for public endpoints that cost money per call:
-- POST /api/auth/send-otp (Twilio) and /api/places/* (Google Places).
-- Found 2026-10-05: neither had a per-IP limit. See lib/ip-rate-limit.ts.
--
-- One row per counted call. ip_hash is a peppered hash, never the raw IP.
-- Run this as soon as the code is deployed. Until then the limit is off (a
-- missing table lets calls through and logs a warning); any other read error
-- fails closed.

create table if not exists public.ip_rate_hits (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  scope       text not null,
  ip_hash     text not null
);

-- The hot query is "hits for this scope from this ip since X".
create index if not exists ip_rate_hits_scope_ip_time
  on public.ip_rate_hits (scope, ip_hash, created_at desc);
-- Used by the opportunistic purge of rows older than a day.
create index if not exists ip_rate_hits_time
  on public.ip_rate_hits (created_at);

-- Platform convention: RLS on, zero policies. Only the service role reads it.
alter table public.ip_rate_hits enable row level security;

-- Verify (want: true / 0)
-- select c.relname, c.relrowsecurity, count(p.polname)
-- from pg_class c left join pg_policy p on p.polrelid = c.oid
-- where c.relname = 'ip_rate_hits' group by 1, 2;
