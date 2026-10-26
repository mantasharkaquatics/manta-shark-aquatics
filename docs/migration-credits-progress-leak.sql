-- 2026-10-26  兩個資料外洩漏洞（測試「只能看的家人」時發現）
--
-- 1. lesson_credits: a policy "Authenticated users can read credits" USING
--    (true) let any signed-in person -- any family, any coach -- read every
--    family's lesson credits; a second one, "... can update credits", was
--    also USING (true) (harmless only because the browser holds no UPDATE
--    grant). Families keep reading their own through parents_read_own_credits;
--    admin pages read with the service key.
-- 2. student_skill_progress: a policy named "service role full access" was
--    written for role public with USING (true), and anon holds SELECT: anyone,
--    signed in or not, could read every swimmer's skill progress. Only server
--    code (service key) reads it; the coach policies stay.
--
-- Safe to run more than once.

begin;
drop policy if exists "Authenticated users can read credits" on public.lesson_credits;
drop policy if exists "Authenticated users can update credits" on public.lesson_credits;
revoke select on public.lesson_credits from anon;
drop policy if exists "service role full access" on public.student_skill_progress;
revoke select on public.student_skill_progress from anon;
commit;

select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename in ('lesson_credits', 'student_skill_progress') order by 1, 2;
