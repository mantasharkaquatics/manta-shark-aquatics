-- 2026-10-08  fix5-A: chat replies the family has not read, and monthly-report questions
--
-- Safe to run more than once. Run after the code is deployed (the code works
-- without it: no unread dot, no reply email, no "Monthly report questions"
-- queue until it has run).
--
-- 1. chat_threads.parent_last_read_at -- the newest message the family has had
--    on screen with the chat open (components/ChatWidget sets it). The chat
--    button shows a dot for desk / AI messages after it.
--    chat_threads.parent_reply_emailed_at -- when the "we replied in the chat"
--    email last went out (app/api/cron/chat-reply-email), so each batch of
--    unread desk replies is emailed once.
--
--    Existing threads start "read up to" their latest message that is not a
--    desk reply (the family was there for the AI's answers and their own
--    messages). A desk reply after that shows as unread, and if it is from the
--    last 24 hours and 10+ minutes old, the next cron run emails it once.
--
-- 2. monthly_reports.question_resolved_at / question_resolved_by -- an
--    "I have a question" (feedback = 'down') stays on Admin > Reviews until a
--    manager marks it handled. Questions already sent before this ran show up
--    there too; mark any old ones handled.

begin;

alter table public.chat_threads add column if not exists parent_last_read_at timestamptz;
alter table public.chat_threads add column if not exists parent_reply_emailed_at timestamptz;

update public.chat_threads t
set parent_last_read_at = coalesce(
  (select max(m.created_at) from public.chat_messages m
    where m.thread_id = t.id and m.sender_type <> 'admin'),
  t.created_at,
  now())
where t.parent_last_read_at is null;

-- The cron job reads desk replies by time every few minutes.
create index if not exists chat_messages_admin_created_idx
  on public.chat_messages (created_at) where sender_type = 'admin';

alter table public.monthly_reports add column if not exists question_resolved_at timestamptz;
alter table public.monthly_reports add column if not exists question_resolved_by uuid;

create index if not exists monthly_reports_open_questions_idx
  on public.monthly_reports (feedback_at) where feedback = 'down' and question_resolved_at is null;

commit;

-- Verify: four rows, one per new column.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'chat_threads' and column_name in ('parent_last_read_at', 'parent_reply_emailed_at'))
    or (table_name = 'monthly_reports' and column_name in ('question_resolved_at', 'question_resolved_by')))
order by table_name, column_name;

-- Verify: threads with a desk reply the family has not seen (expected to be few).
select t.id, t.parent_id, t.parent_last_read_at,
  (select max(m.created_at) from public.chat_messages m where m.thread_id = t.id and m.sender_type = 'admin') as last_desk_reply
from public.chat_threads t
where t.parent_id is not null
  and exists (select 1 from public.chat_messages m
              where m.thread_id = t.id and m.sender_type = 'admin' and m.created_at > t.parent_last_read_at);
