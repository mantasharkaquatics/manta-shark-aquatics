-- ===========================================================================
--  RESET TEST DATA
--  Rewritten 2026-08-27.
--
--  Wipes every family-side record so you can start testing from an empty
--  system: parents, swimmers, bookings, past class sessions, attendance,
--  lesson notes, credits, token packages, invoices, memberships, progress
--  and chat threads. All of it is fake data.
--
--  What this deliberately KEEPS -- the setup that would be painful to
--  rebuild:
--      levels, skills, course_types, team_tiers, lesson_packages, coupons,
--      coaches, admins, note_glossary, system_settings,
--      coach_availability, coach_availability_zones, coach_time_off
--
--  Three things worth knowing before you start:
--
--  * STEP 2 is one transaction. If a foreign key I did not anticipate stops
--    it halfway, Postgres rolls the WHOLE thing back and nothing is deleted.
--    You will see an error naming the table -- send it to me and I will add
--    it. A failed run is safe; it is not a half-purged database.
--
--  * Every DELETE is guarded by "does this table exist", so tables that have
--    since been renamed or dropped are skipped instead of erroring, and the
--    deletes retry until the foreign keys are satisfied -- so a table I have
--    the order wrong for still comes out clean.
--
--  * Tested by restoring the 2026-08-27 backup into a scratch Postgres 16 --
--    49 tables, 88 foreign keys, 16 triggers, the real current schema -- and
--    running the whole thing against it: every table below went to 0 in a
--    single pass, every kept table was untouched, and every trigger came back
--    enabled.
--
--  * Deleting is not reversible. Take a Supabase backup first
--    (Database -> Backups), even though you believe every row here is
--    disposable.
--
--  Where to run it: Supabase dashboard -> SQL Editor. One step at a time.
-- ===========================================================================


-- ---------------------------------------------------------------------------
--  STEP 1 -- LOOK FIRST. Read-only. Deletes nothing.
--  Run this on its own and read the numbers. The "delete" rows are exactly
--  what STEP 2 removes; the "keep" rows should still be there afterwards.
-- ---------------------------------------------------------------------------

SELECT
  t.what,
  t.tbl AS table_name,
  (xpath('/row/c/text()',
         query_to_xml(format('SELECT count(*) AS c FROM public.%I', t.tbl),
                      false, true, '')))[1]::text::bigint AS rows
FROM (VALUES
  ('delete','parents'), ('delete','students'), ('delete','bookings'),
  ('delete','class_sessions'), ('delete','attendance'), ('delete','team_attendance'),
  ('delete','lesson_notes'), ('delete','lesson_note_translations'), ('delete','report_edits'),
  ('delete','lesson_credits'), ('delete','token_packages'), ('delete','purchases'),
  ('delete','invoices'), ('delete','team_memberships'),
  ('delete','student_skill_progress'), ('delete','progress_history'),
  ('delete','level_upgrades'), ('delete','level_recommendations'),
  ('delete','student_notes'), ('delete','chat_threads'), ('delete','chat_messages'),
  ('delete','parent_partnerships'), ('delete','contact_change_requests'),
  ('delete','booking_students'), ('delete','makeup_credits'), ('delete','waitlist'),
  ('delete','messages'), ('delete','message_threads'), ('delete','notification_log'),
  ('delete','ai_tool_logs'), ('delete','phone_otps'), ('delete','email_otps'),
  ('keep','coaches'), ('keep','admins'), ('keep','course_types'), ('keep','skills'),
  ('keep','levels'), ('keep','team_tiers'), ('keep','lesson_packages'),
  ('keep','coupons'), ('keep','note_glossary'), ('keep','system_settings'),
  ('keep','coach_availability'), ('keep','coach_availability_zones'),
  ('keep','coach_time_off')
) AS t(what, tbl)
WHERE to_regclass('public.' || t.tbl) IS NOT NULL
ORDER BY t.what DESC, t.tbl;


-- ---------------------------------------------------------------------------
--  STEP 2 -- THE PURGE. Select everything from BEGIN to COMMIT and run it.
--  It blanks the optional links between these tables first, then deletes,
--  retrying anything a foreign key still blocks until nothing is left.
-- ---------------------------------------------------------------------------

BEGIN;

DO $$
DECLARE
  r        record;
  t        text;
  n        bigint;
  pass     int := 0;
  moved    boolean;
  todo     text[] := '{}';
  todo_all text[] := '{}';
  stuck    text[] := '{}';
  last_err text := '';
  list     text[] := ARRAY[
    -- lesson notes and everything hanging off them
    'lesson_note_translations', 'report_edits', 'lesson_notes',
    -- attendance, bookings and the sessions they sit on
    'attendance', 'team_attendance', 'booking_students', 'makeup_credits',
    'waitlist', 'bookings', 'class_sessions',
    -- swimmer progress
    'student_skill_progress', 'progress_history', 'level_upgrades',
    'level_recommendations', 'student_notes',
    -- money
    'invoices', 'team_memberships', 'lesson_credits', 'token_packages',
    'purchases',
    -- conversations and logs
    'chat_messages', 'chat_threads', 'messages', 'message_threads',
    'notification_log', 'ai_tool_logs',
    -- the families themselves
    'parent_partnerships', 'contact_change_requests', 'students', 'parents',
    -- one-time codes
    'phone_otps', 'email_otps'
  ];
BEGIN
  -- Keep only the tables that actually exist in this database.
  FOREACH t IN ARRAY list LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      todo := todo || t;
    ELSE
      RAISE NOTICE 'skipped % (no such table)', t;
    END IF;
  END LOOP;

  -- Business-rule triggers guard normal use: a booking must belong to an
  -- assessed swimmer, a coach cannot be double-booked, a parent cannot exceed
  -- their swimmer limit. They have no place in a wipe and they DO refuse the
  -- work below. Switch them off for this transaction; foreign keys stay on,
  -- and a rollback puts them back.
  todo_all := todo;
  FOREACH t IN ARRAY todo LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
  END LOOP;

  -- Some of these tables point at each other in a loop -- a booking points at
  -- the token package it came from and the package points back at the
  -- booking -- so no delete order can satisfy every foreign key. Blanking the
  -- optional links first breaks every such loop, and these rows are all about
  -- to be deleted anyway.
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN unnest(c.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE c.contype = 'f'
      AND NOT a.attnotnull
      AND c.connamespace = 'public'::regnamespace
      AND c.conrelid::regclass::text = ANY (todo)
  LOOP
    EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL',
                   r.tbl, r.col, r.col);
  END LOOP;

  -- Delete, retrying whatever a foreign key still blocks. Each pass frees up
  -- the next one, so the order in the list above is a hint, not a
  -- requirement.
  LOOP
    pass  := pass + 1;
    moved := false;
    stuck := '{}';
    FOREACH t IN ARRAY todo LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I', t);
        GET DIAGNOSTICS n = ROW_COUNT;
        moved := true;
        RAISE NOTICE 'deleted % row(s) from %', n, t;
      EXCEPTION WHEN foreign_key_violation THEN
        stuck    := stuck || t;
        last_err := SQLERRM;
      END;
    END LOOP;
    todo := stuck;
    EXIT WHEN array_length(todo, 1) IS NULL;
    IF NOT moved THEN
      RAISE EXCEPTION 'cannot get past these tables: %. Last error: %',
                      array_to_string(todo, ', '), last_err;
    END IF;
    IF pass > 20 THEN
      RAISE EXCEPTION 'still going after 20 passes; stopping. Left: %',
                      array_to_string(todo, ', ');
    END IF;
  END LOOP;

  -- Triggers back on.
  FOREACH t IN ARRAY todo_all LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t);
  END LOOP;
END $$;

-- Read these before you commit. Every number should be 0.
SELECT 'parents' AS table_name, count(*) FROM public.parents
UNION ALL SELECT 'students',       count(*) FROM public.students
UNION ALL SELECT 'bookings',       count(*) FROM public.bookings
UNION ALL SELECT 'class_sessions', count(*) FROM public.class_sessions
UNION ALL SELECT 'invoices',       count(*) FROM public.invoices
UNION ALL SELECT 'lesson_credits', count(*) FROM public.lesson_credits
UNION ALL SELECT 'token_packages', count(*) FROM public.token_packages
ORDER BY 1;

COMMIT;
-- If anything above looked wrong, run ROLLBACK; instead of COMMIT;


-- ---------------------------------------------------------------------------
--  STEP 3 -- THE LOGINS. Read this one; it decides whether you can re-register
--  with the same email address.
--
--  Deleting a parents row does not delete the login behind it. That account
--  still lives in auth.users, can still sign in, and lands on a dashboard
--  with no family attached -- which looks broken rather than logged out. It
--  also blocks signing up again with the same email.
--
--  This lists the logins that no longer belong to anybody:
-- ---------------------------------------------------------------------------

SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN public.parents p ON p.auth_user_id = u.id
LEFT JOIN public.coaches c ON c.auth_user_id = u.id
LEFT JOIN public.admins  a ON a.auth_user_id = u.id
WHERE p.id IS NULL AND c.id IS NULL AND a.id IS NULL
ORDER BY u.created_at;

-- READ THAT LIST BEFORE DELETING ANYTHING. Your own admin login must NOT be
-- in it -- if it is, stop, because something is wrong with the admins table.
--
-- Delete the ones you recognise as test accounts in the dashboard:
--     Authentication -> Users -> select -> Delete user
-- That path cleans up the identity and session rows too, which a plain
-- DELETE on auth.users does not always do.


-- ---------------------------------------------------------------------------
--  STEP 4 -- OPTIONAL. The trial / applicant flow.
--  Only run this if the rows in applicants are also test rows. If a real
--  person has applied through the site, skip this section entirely.
--  Check first:
--      SELECT id, created_at, email FROM public.applicants ORDER BY created_at;
-- ---------------------------------------------------------------------------

-- BEGIN;
-- DELETE FROM public.applicant_verifications;
-- DELETE FROM public.applicant_sessions;
-- DELETE FROM public.applications;
-- DELETE FROM public.applicants;
-- COMMIT;

-- Coach applications are separate and are probably real people. Look before
-- you delete:
--      SELECT id, created_at, email, status FROM public.coach_applications
--      ORDER BY created_at;
