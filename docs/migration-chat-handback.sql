-- 2026-10-08: when the desk took a chat over (lib/chat-handback.ts).
-- The desk being quiet for 30 minutes hands the chat back to the AI; a
-- take-over with no reply yet counts from this time. Safe to run twice.
alter table public.chat_threads add column if not exists human_since timestamptz;

select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'chat_threads' and column_name = 'human_since';
