-- Error alerts (owner, 2026-10-26). lib/error-report.ts.
-- error_events: one row per kind of error (signature), counted; the site
-- emails the school the first time and at most once an hour after that.
-- cron_runs: when each scheduled job last ran, so a stopped job is noticed.
-- Server-only: RLS on, no policies (the service role is the only reader).

create table if not exists public.error_events (
  signature text primary key,
  source text not null,
  message text not null,
  where_from text,
  detail text,
  count integer not null default 1,
  since_alert integer not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_alerted_at timestamptz
);
create index if not exists error_events_last_seen on public.error_events (last_seen desc);
alter table public.error_events enable row level security;

create table if not exists public.cron_runs (
  name text primary key,
  last_run_at timestamptz not null default now()
);
alter table public.cron_runs enable row level security;

-- Count one occurrence and say whether to email now. Caps: 20 alert emails
-- an hour in all, 5 from browsers (anyone can post to that endpoint); the
-- rest wait for the daily summary.
create or replace function public.error_event_hit(
  p_sig text, p_source text, p_message text, p_where text, p_detail text, p_every_minutes integer default 60
) returns table (should_alert boolean, since_alert integer, first_seen timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  r public.error_events;
  sent_hour integer;
  browser_hour integer;
begin
  insert into public.error_events as e (signature, source, message, where_from, detail, since_alert)
  values (p_sig, p_source, left(p_message, 500), left(p_where, 200), left(p_detail, 4000), 1)
  on conflict (signature) do update
    set count = e.count + 1, since_alert = e.since_alert + 1, last_seen = now(),
        message = excluded.message, detail = excluded.detail
  returning * into r;

  if r.last_alerted_at is not null and r.last_alerted_at > now() - make_interval(mins => p_every_minutes) then
    return query select false, r.since_alert, r.first_seen; return;
  end if;
  select count(*) into sent_hour from public.error_events where last_alerted_at > now() - interval '1 hour';
  select count(*) into browser_hour from public.error_events
    where source = 'browser' and last_alerted_at > now() - interval '1 hour';
  if sent_hour >= 20 or (p_source = 'browser' and browser_hour >= 5) then
    return query select false, r.since_alert, r.first_seen; return;
  end if;
  update public.error_events set last_alerted_at = now(), since_alert = 0 where signature = p_sig;
  return query select true, r.since_alert, r.first_seen;
end $$;

revoke all on function public.error_event_hit(text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.error_event_hit(text, text, text, text, text, integer) to service_role;

-- Check: two tables, one function.
select table_name from information_schema.tables where table_schema = 'public' and table_name in ('error_events', 'cron_runs')
union all
select proname from pg_proc where proname = 'error_event_hit';
