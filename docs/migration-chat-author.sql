-- Which family member wrote a chat message (14-role test 2, J07). Null for
-- the main account and for messages written before this. The server writes
-- it (/api/chat/send, /photo, /to-team); families cannot. Run on both
-- projects (production and manta-dev). Safe to run twice.
alter table public.chat_messages
  add column if not exists sender_guardian_id uuid references public.parent_guardians(id) on delete set null;

-- Check: should return one row, sender_guardian_id.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'chat_messages' and column_name = 'sender_guardian_id';
