-- Whose phone a calendar subscription link was made for (14-role test 2,
-- J05). Removing a family member deletes their links (lib/guardians.ts), and
-- the feed refuses a link whose owner has left the family. Run on both
-- projects (production and manta-dev). Safe to run twice.
alter table public.calendar_feed_devices add column if not exists auth_user_id uuid;
create index if not exists calendar_feed_devices_auth_user_id_idx on public.calendar_feed_devices (auth_user_id);

-- Check: should return one row, auth_user_id.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'calendar_feed_devices' and column_name = 'auth_user_id';
