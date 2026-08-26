-- ===========================================================================
--  PRE-LAUNCH TEST DATA PURGE
--  Written 2026-08-26. Run this ONLY when you are ready to open to real
--  families, and only after you have read STEP 1's output.
--
--  What this removes: every family-side record -- parents, swimmers, their
--  bookings, class sessions, credits, invoices, memberships, progress and
--  chat threads. All of it is the fake data we have been testing with.
--
--  What this deliberately KEEPS: everything that is real setup and would be
--  painful to rebuild --
--      levels, skills, course_types, team_tiers,
--      coaches, admins, note_glossary,
--      coach_availability, coach_availability_zones, coach_time_off
--
--  Two things worth knowing before you start:
--
--  * STEP 2 is one transaction. If a foreign key I did not anticipate stops
--    it halfway, Postgres rolls the WHOLE thing back and nothing is deleted.
--    You will see an error naming the table -- send it to me and I will add
--    it. A failed run is safe; it is not a half-purged database.
--
--  * Deleting is not reversible. Take a Supabase backup first (Database ->
--    Backups), even though you believe every row here is disposable.
-- ===========================================================================


-- ---------------------------------------------------------------------------
--  STEP 1 -- LOOK FIRST. Read-only. Deletes nothing.
--  Run this on its own and read the numbers. This is exactly what STEP 2
--  will remove.
-- ---------------------------------------------------------------------------

SELECT 'parents'                  AS table_name, count(*) FROM public.parents
UNION ALL SELECT 'students',                count(*) FROM public.students
UNION ALL SELECT 'bookings',                count(*) FROM public.bookings
UNION ALL SELECT 'class_sessions',          count(*) FROM public.class_sessions
UNION ALL SELECT 'attendance',              count(*) FROM public.attendance
UNION ALL SELECT 'team_attendance',         count(*) FROM public.team_attendance
UNION ALL SELECT 'lesson_notes',            count(*) FROM public.lesson_notes
UNION ALL SELECT 'lesson_credits',          count(*) FROM public.lesson_credits
UNION ALL SELECT 'token_packages',          count(*) FROM public.token_packages
UNION ALL SELECT 'purchases',               count(*) FROM public.purchases
UNION ALL SELECT 'invoices',                count(*) FROM public.invoices
UNION ALL SELECT 'team_memberships',        count(*) FROM public.team_memberships
UNION ALL SELECT 'student_skill_progress',  count(*) FROM public.student_skill_progress
UNION ALL SELECT 'progress_history',        count(*) FROM public.progress_history
UNION ALL SELECT 'level_upgrades',          count(*) FROM public.level_upgrades
UNION ALL SELECT 'level_recommendations',   count(*) FROM public.level_recommendations
UNION ALL SELECT 'student_notes',           count(*) FROM public.student_notes
UNION ALL SELECT 'chat_threads',            count(*) FROM public.chat_threads
UNION ALL SELECT 'chat_messages',           count(*) FROM public.chat_messages
UNION ALL SELECT 'parent_partnerships',     count(*) FROM public.parent_partnerships
UNION ALL SELECT 'contact_change_requests', count(*) FROM public.contact_change_requests
UNION ALL SELECT '-- kept: coaches',        count(*) FROM public.coaches
UNION ALL SELECT '-- kept: course_types',   count(*) FROM public.course_types
UNION ALL SELECT '-- kept: skills',         count(*) FROM public.skills
UNION ALL SELECT '-- kept: team_tiers',     count(*) FROM public.team_tiers
ORDER BY 1;


-- ---------------------------------------------------------------------------
--  STEP 2 -- THE PURGE. Select everything from BEGIN to COMMIT and run it.
--  Children before parents, so the foreign keys are satisfied on the way down.
-- ---------------------------------------------------------------------------

BEGIN;

-- lesson notes and everything hanging off them
DELETE FROM public.lesson_note_translations;
DELETE FROM public.report_edits;
DELETE FROM public.lesson_notes;

-- attendance, then the bookings it refers to, then the sessions
DELETE FROM public.attendance;
DELETE FROM public.team_attendance;
DELETE FROM public.bookings;
DELETE FROM public.class_sessions;

-- swimmer progress
DELETE FROM public.student_skill_progress;
DELETE FROM public.progress_history;
DELETE FROM public.level_upgrades;
DELETE FROM public.level_recommendations;
DELETE FROM public.student_notes;

-- money. invoices point at memberships, so invoices go first
DELETE FROM public.invoices;
DELETE FROM public.team_memberships;
DELETE FROM public.purchases;
DELETE FROM public.lesson_credits;
DELETE FROM public.token_packages;

-- conversations
DELETE FROM public.chat_messages;
DELETE FROM public.chat_threads;

-- the families themselves
DELETE FROM public.parent_partnerships;
DELETE FROM public.contact_change_requests;
DELETE FROM public.students;
DELETE FROM public.parents;

-- one-time codes; these expire on their own but there is no reason to open
-- with a table full of test codes
DELETE FROM public.phone_otps;
DELETE FROM public.email_otps;

-- Read these before you commit. Every number should be 0.
SELECT 'parents' AS table_name, count(*) FROM public.parents
UNION ALL SELECT 'students',       count(*) FROM public.students
UNION ALL SELECT 'bookings',       count(*) FROM public.bookings
UNION ALL SELECT 'class_sessions', count(*) FROM public.class_sessions
UNION ALL SELECT 'invoices',       count(*) FROM public.invoices
UNION ALL SELECT 'lesson_credits', count(*) FROM public.lesson_credits
ORDER BY 1;

COMMIT;
-- If anything above looked wrong, run ROLLBACK; instead of COMMIT;


-- ---------------------------------------------------------------------------
--  STEP 3 -- OPTIONAL. The trial / applicant flow.
--  Only run this if the rows in applicants are also test rows. If any real
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
--      SELECT id, created_at, email, status FROM public.coach_applications ORDER BY created_at;


-- ---------------------------------------------------------------------------
--  STEP 4 -- OPTIONAL, AND THE ONE TO THINK ABOUT.
--  Deleting a parents row does not delete their login. Those accounts sit in
--  auth.users and can still sign in -- they just land on a dashboard with no
--  family attached, which looks broken rather than logged out.
--
--  This finds the logins that no longer belong to anybody:
-- ---------------------------------------------------------------------------

SELECT u.id, u.email, u.created_at
FROM auth.users u
LEFT JOIN public.parents  p ON p.auth_user_id  = u.id
LEFT JOIN public.coaches  c ON c.auth_user_id  = u.id
LEFT JOIN public.admins   a ON a.auth_user_id  = u.id
WHERE p.id IS NULL AND c.id IS NULL AND a.id IS NULL
ORDER BY u.created_at;

-- READ THAT LIST BEFORE DELETING ANYTHING. Your own account, and anyone
-- else's you want to keep, must not be in it -- if it is, stop and tell me.
-- Once the list contains only test logins:
--
-- DELETE FROM auth.users u
-- WHERE NOT EXISTS (SELECT 1 FROM public.parents p WHERE p.auth_user_id = u.id)
--   AND NOT EXISTS (SELECT 1 FROM public.coaches c WHERE c.auth_user_id = u.id)
--   AND NOT EXISTS (SELECT 1 FROM public.admins  a WHERE a.auth_user_id = u.id);
