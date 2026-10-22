-- 2026-10-22  第三級：訪客找真人、儲存信用卡、申請刪除帳戶
--
-- Owner, 2026-10-22 (tier 3 of the "hardest customer" review):
--
-- 1. chat_threads.guest_*: a visitor who is not signed up can ask for a
--    person from the chat (components/ChatWidget, /api/chat/guest/contact).
--    They leave a name and an email (phone optional); the desk is alerted by
--    email + text, and every desk reply is emailed to them
--    (/api/admin/chat-message). guest_lang is the language they chatted in.
-- 2. parents.stripe_customer_id: the family's Stripe customer, so a card the
--    family chooses to remember at checkout is offered next time
--    (lib/stripe-customer.ts). The card itself stays in Stripe.
-- 3. parents.deletion_requested_at: the family asked for the account to be
--    deleted (My Account). The desk settles points, lessons and any team
--    subscription with them first; the family can withdraw the request.
--
-- Safe to run more than once.

alter table public.chat_threads
  add column if not exists guest_name text,
  add column if not exists guest_email text,
  add column if not exists guest_phone text,
  add column if not exists guest_lang text,
  add column if not exists guest_contact_at timestamptz;

alter table public.parents
  add column if not exists stripe_customer_id text,
  add column if not exists deletion_requested_at timestamptz;

create unique index if not exists parents_stripe_customer_id
  on public.parents (stripe_customer_id) where stripe_customer_id is not null;

-- Check (3 rows):
-- select table_name, column_name from information_schema.columns
--  where table_schema = 'public'
--    and ((table_name = 'parents' and column_name in ('stripe_customer_id', 'deletion_requested_at'))
--      or (table_name = 'chat_threads' and column_name = 'guest_email'));
