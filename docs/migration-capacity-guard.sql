-- 2026-10-16  每堂課的最後一個名額只能賣一次（audit F81）
--
-- RUN THIS ONLY AFTER THE CODE FROM THIS CHANGE IS DEPLOYED.
-- The new code knows the error this trigger raises (SESSION_FULL): it gives
-- back the points, releases the make-up voucher, removes the rows it had
-- already written and tells the family "This time is now full. Please pick
-- another time." (the desk sees its own message). The old code does not
-- know it and would answer with a generic failure -- and in a few paths
-- could leave points taken for a lesson that was never booked.
--
-- Why: every booking route checks "is there a seat left?" by reading, and
-- then writes. Two families paying for the last seat of a 1-on-4 (or the
-- desk and a family) at the same moment both read "1 seat left" and both
-- got it. The existing trigger trg_booking_count (update_enrolled_count)
-- only counts AFTER the row is in; it marks the class 'full' but never says
-- no. Owner, 2026-10-16: no deliberate overbooking for anyone, the desk
-- included.
--
-- What it does: a BEFORE INSERT OR UPDATE OF status, class_session_id
-- trigger on bookings. For a row going into a counted status ('confirmed',
-- 'completed', 'pending_payment', 'in_cart' -- the same four
-- update_enrolled_count counts) it locks that class_sessions row, counts the
-- OTHER counted bookings already in it and refuses the row if it would be
-- one too many. 'pending_partner' (a 1-on-2 invitation waiting for an
-- answer) is not counted here, as it is not in enrolled_count; the code
-- holds those seats itself (lib/bookings/invite-holds). When the invitation
-- is accepted the row turns 'confirmed' and is checked then.
--
-- Not checked (on purpose): an UPDATE that leaves a row in the same session
-- and it was already counted (pending_payment -> confirmed, confirmed ->
-- completed): the seat is already theirs. A session with no max_students.
--
-- Two at once: the FOR UPDATE lock on the class_sessions row makes the
-- second booking wait for the first to commit, and then count it.
-- Several rows in one INSERT (two siblings into one class, a batch of
-- weeks): PostgreSQL fires a BEFORE ROW trigger once per row, and the count
-- inside it sees the rows already inserted earlier in the same statement,
-- so the second sibling is counted against the first. Covered.
--
-- Safe to run more than once (create or replace / drop trigger if exists).

-- 1. Before: any lesson that is ALREADY over its capacity. Expect 0 rows.
--    Rows here do not stop the trigger from being created; they mean that
--    lesson cannot take anyone else, and that the desk should look at it.
select cs.id as session_id, cs.session_date, cs.start_time, cs.coach_id,
       cs.max_students, count(b.id) as counted_bookings
from public.class_sessions cs
join public.bookings b
  on b.class_session_id = cs.id
 and b.status in ('confirmed', 'completed', 'pending_payment', 'in_cart')
where cs.max_students is not null
group by cs.id, cs.session_date, cs.start_time, cs.coach_id, cs.max_students
having count(b.id) > cs.max_students
order by cs.session_date, cs.start_time;

-- 2. The guard.
create or replace function public.bookings_capacity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cap   integer;
  v_taken integer;
begin
  if new.class_session_id is null
     or new.status is null
     or new.status not in ('confirmed', 'completed', 'pending_payment', 'in_cart') then
    return new;
  end if;

  -- Already holding a seat in this same session: nothing new is taken.
  if tg_op = 'UPDATE'
     and old.class_session_id is not distinct from new.class_session_id
     and old.status in ('confirmed', 'completed', 'pending_payment', 'in_cart') then
    return new;
  end if;

  -- One booking into this session at a time, from here to commit.
  select cs.max_students into v_cap
  from public.class_sessions cs
  where cs.id = new.class_session_id
  for update;

  if v_cap is null then
    return new;
  end if;

  select count(*) into v_taken
  from public.bookings b
  where b.class_session_id = new.class_session_id
    and b.id is distinct from new.id
    and b.status in ('confirmed', 'completed', 'pending_payment', 'in_cart');

  if v_taken + 1 > v_cap then
    raise exception 'SESSION_FULL'
      using errcode = 'P0001',
            detail = format('class_session %s already holds %s of %s', new.class_session_id, v_taken, v_cap);
  end if;

  return new;
end
$$;

-- 3. The trigger. BEFORE triggers run in name order, so this one runs before
--    trg_booking_coach_conflict and trg_student_booking_overlap.
drop trigger if exists trg_booking_capacity_guard on public.bookings;
create trigger trg_booking_capacity_guard
  before insert or update of status, class_session_id
  on public.bookings
  for each row execute function public.bookings_capacity_guard();

-- 4. Verification. Expect one row: trg_booking_capacity_guard, BEFORE, with
--    INSERT and UPDATE, and the function with search_path=public.
select t.tgname as trigger_name,
       case when t.tgtype & 2 = 2 then 'BEFORE' else 'AFTER' end as timing,
       (t.tgtype & 4 = 4) as on_insert,
       (t.tgtype & 16 = 16) as on_update,
       p.proname as function_name,
       p.proconfig as function_settings
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.bookings'::regclass
  and t.tgname = 'trg_booking_capacity_guard';

-- 5. Optional proof that it refuses, which changes nothing: it finds a full
--    lesson and a swimmer not in it, tries to add them, and records what the
--    database answered. The attempted row is always undone (the inner block
--    rolls back on any error, and is forced to error if the insert worked).
--    Run these three statements together. Expect one row: SESSION_FULL.
--    'no full lesson to test with' is fine too -- there was nothing to try.
create temp table if not exists capacity_guard_test (result text);

do $$
declare
  v_session public.class_sessions.id%type;
  v_student public.students.id%type;
  v_parent  public.students.parent_id%type;
begin
  select cs.id into v_session
  from public.class_sessions cs
  where cs.max_students is not null
    and (select count(*) from public.bookings b
         where b.class_session_id = cs.id
           and b.status in ('confirmed', 'completed', 'pending_payment', 'in_cart')) >= cs.max_students
  limit 1;
  if v_session is null then
    insert into capacity_guard_test values ('no full lesson to test with');
    return;
  end if;

  select s.id, s.parent_id into v_student, v_parent
  from public.students s
  where not exists (select 1 from public.bookings b where b.class_session_id = v_session and b.student_id = s.id)
  limit 1;

  begin
    insert into public.bookings (class_session_id, parent_id, student_id, status)
    values (v_session, v_parent, v_student, 'confirmed');
    raise exception 'GUARD_DID_NOT_FIRE';
  exception when others then
    insert into capacity_guard_test values (sqlerrm);
  end;
end
$$;

select result from capacity_guard_test;
