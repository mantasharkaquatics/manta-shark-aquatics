-- Which photo/video release a family agreed to (owner, 2026-11-06, run-2
-- J61). Written when the switch is turned on (sign-up or My Account) and kept
-- when it is turned off. Run on both projects. Safe to run twice.
alter table public.parents add column if not exists media_release_version text;

-- Check: should return one row, media_release_version.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'parents' and column_name = 'media_release_version';
