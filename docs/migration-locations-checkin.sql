-- 2026-10-09  "I'm here" self check-in, set per pool from Admin > Locations
--
-- Safe to run more than once, and safe to run BEFORE the code that uses it is
-- deployed: the new columns start empty, and a pool with no coordinates is not
-- a check-in point, so nothing changes until the desk types them in.
--
-- Needs docs/migration-locations.sql first (the locations table).
--
-- public.locations gains where the pool is and how close counts as "there":
--   lat, lng          -- the pool's coordinates. Both set = the parent's
--                        "I'm here" button works at this pool. Empty = it
--                        does not (families use the QR code, as today).
--   checkin_radius_m  -- metres from that point that count as at the pool.
--                        150 covers the building and its car park at a
--                        typical community pool without reaching the street
--                        beyond. Admin > Locations allows 50 to 500.

begin;

alter table public.locations add column if not exists lat double precision;
alter table public.locations add column if not exists lng double precision;
alter table public.locations add column if not exists checkin_radius_m int not null default 150;

-- Half a point is no point: both coordinates or neither, each in range.
alter table public.locations drop constraint if exists locations_checkin_point;
alter table public.locations add constraint locations_checkin_point check (
  ((lat is null) = (lng is null))
  and (lat is null or lat between -90 and 90)
  and (lng is null or lng between -180 and 180)
  and checkin_radius_m between 50 and 500
);

commit;

-- Check: every pool, with its check-in point (none yet until the desk sets one).
select id, name, is_active, lat, lng, checkin_radius_m,
       (lat is not null and lng is not null) as self_checkin
from public.locations
order by sort_order;
