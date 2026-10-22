-- 2026-10-22  前一天的提醒 Email
--
-- Owner, 2026-10-22 (tier 2): besides the day-before text, every family gets a
-- day-before email (address, map, arrival notes, calendar file). It has its own
-- once-only stamp, separate from the text's reminder_sent_at, because not every
-- family can get texts. Until this runs, the cron sends texts only.
--
-- Safe to run more than once.

alter table public.bookings add column if not exists reminder_email_sent_at timestamptz;

-- 檢查：應該是 1 列
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'bookings' and column_name = 'reminder_email_sent_at';
