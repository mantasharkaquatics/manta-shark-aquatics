-- 2026-10-23  收回訊息（Admin > Messages）
--
-- Owner, 2026-10-23: the desk can recall a desk reply or an AI reply up to
-- 24 hours old. The desk still sees it, folded and marked recalled; the
-- family or visitor sees nothing at all.
--
-- recalled_at / recalled_by: when and by which admin.
-- email_id: Resend's id for a visitor's reply email, which is held 2 minutes
--           so a recall in that time cancels it (/api/admin/chat-recall).
--
-- The family read policy now skips recalled rows. Families only ever had
-- SELECT on chat_messages (every write goes through the server), so the
-- policy is rewritten FOR SELECT. The admin policy is unchanged.
--
-- Run this BEFORE the code that uses it is deployed. Safe to run more than once.

alter table public.chat_messages
  add column if not exists recalled_at timestamptz,
  add column if not exists recalled_by uuid,
  add column if not exists email_id text;

drop policy if exists parents_own_messages on public.chat_messages;
create policy parents_own_messages on public.chat_messages
  for select to authenticated
  using (
    recalled_at is null
    and thread_id in (select id from public.chat_threads where parent_id = (select public.my_parent_id()))
  );

-- Check (3 rows, then 1 row whose qual contains "recalled_at IS NULL"):
-- select column_name from information_schema.columns
--  where table_schema = 'public' and table_name = 'chat_messages'
--    and column_name in ('recalled_at', 'recalled_by', 'email_id');
-- select policyname, cmd, qual from pg_policies
--  where tablename = 'chat_messages' and policyname = 'parents_own_messages';
