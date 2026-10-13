-- Turning a manager's back-office access off and on again (owner, 2026-10-13).
--
-- Disabling moves the login id out of admins.auth_user_id into this column.
-- Every admin check in the app matches admins.auth_user_id to the signed-in
-- user, so the access ends on the manager's very next request, and the row
-- stays for the history that names them. Restoring moves the id back.
-- The login itself is also banned in Supabase Auth, so they cannot sign in.
--
-- Safe to run more than once.

alter table public.admins add column if not exists disabled_auth_user_id uuid;

-- Check: one row, data_type uuid.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'admins' and column_name = 'disabled_auth_user_id';
