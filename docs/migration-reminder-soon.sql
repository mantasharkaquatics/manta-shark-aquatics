-- 課前提醒 (owner, 2026-11-14): each person picks how long before a lesson its
-- push comes -- 0 (none), 30 or 60 minutes; empty = 60. lib/lesson-soon.ts,
-- app/api/push/settings, components/PushSettings. The half-hour push has its
-- own stamp so each lesson gets it once. Run on BOTH projects. Safe to re-run.
alter table public.push_settings add column if not exists soon_minutes smallint check (soon_minutes in (0, 30, 60));
alter table public.bookings add column if not exists reminder_30m_sent_at timestamptz;
notify pgrst, 'reload schema';
