-- A push about an hour before each lesson (owner, 2026-11-14; lib/lesson-soon.ts,
-- run by the 15-minute cleanup cron). The stamp keeps each lesson to one push.
-- Run on BOTH projects: live (uobflteojebscsfiortb) and manta-dev.
alter table public.bookings add column if not exists reminder_1h_sent_at timestamptz;
