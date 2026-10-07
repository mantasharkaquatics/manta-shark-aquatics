-- Coach time off: refuse a coach's delete once families have been told.
--
-- Why (found 2026-10-07; owner, 2026-10-07): the admin's Time Off page
-- cancels the lessons inside a coach's time off and emails the families, in
-- one step. After that the time off row is the only record of why those
-- lessons were cancelled. The coach portal now deletes through
-- /api/coach/time-off, which refuses in that case -- but the table's RLS still
-- lets a signed-in coach delete their own row straight through the REST API.
-- This trigger closes that path. It only applies to requests made as a
-- signed-in user (JWT role 'authenticated'); the service role (the admin's
-- Remove button, the coach route) and the SQL editor are not affected.
--
-- The app works without this migration; it only adds the database-level guard.

-- Pre-check: the table and the columns the guard reads exist (want 4 rows, then 2 rows).
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'coach_time_off'
--    and column_name in ('coach_id', 'date', 'start_time', 'end_time');
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'bookings'
--    and column_name in ('block_notice_sent_at', 'cancellation_reason');

create or replace function public.coach_time_off_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- security definer (so the check can read every family's bookings) makes
  -- current_user the function owner, so the caller's role is read from the
  -- request's JWT instead: 'authenticated' for a signed-in user, 'service_role'
  -- for the server, null in the SQL editor.
  if coalesce(auth.role(), '') <> 'authenticated' then
    return old;
  end if;
  if exists (
    select 1
      from public.bookings b
      join public.class_sessions s on s.id = b.class_session_id
     where s.coach_id = old.coach_id
       and s.session_date = old.date
       and (old.start_time is null or old.end_time is null
            or (s.start_time < old.end_time and s.end_time > old.start_time))
       and (b.block_notice_sent_at is not null
            or (b.status = 'cancelled' and b.cancellation_reason = 'coach_time_off'))
  ) then
    raise exception 'Families have already been told about this time off. Ask the office to change it.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists coach_time_off_guard_delete on public.coach_time_off;
create trigger coach_time_off_guard_delete
  before delete on public.coach_time_off
  for each row execute function public.coach_time_off_guard_delete();

-- Verify (want 1 row: coach_time_off_guard_delete | O)
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.coach_time_off'::regclass and tgname = 'coach_time_off_guard_delete';
