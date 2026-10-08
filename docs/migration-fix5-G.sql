-- fix5-G (2026-10-08): level band on 1-on-4 group sessions opened by the
-- batch booking path (/api/bookings/recurring) and the fixed-class move.
--
-- The code fix stamps level_min / level_max on every NEW group session from
-- the coach's group zone. This one-off backfill does the same for group
-- sessions already opened without a band, today onwards, so the dashboard's
-- "Level x-y" tag shows on them too. Past sessions are left alone (the zone
-- template may have changed since). Data only, no schema change; safe to run
-- more than once (it only touches rows whose band is still empty).
--
-- Zone resolution matches lib/zones.ts: a coach's date rows for that day
-- replace the weekly template; weekday 0 = Sunday (same as EXTRACT(DOW)).

WITH band AS (
  SELECT cs.id, z.group_level_min, z.group_level_max
  FROM public.class_sessions cs
  JOIN public.course_types ct ON ct.id = cs.course_type_id
  CROSS JOIN LATERAL (
    SELECT za.group_level_min, za.group_level_max
    FROM public.coach_availability_zones za
    WHERE za.coach_id = cs.coach_id
      AND za.zone_type = 'group'
      AND za.group_level_min IS NOT NULL
      AND za.group_level_max IS NOT NULL
      AND za.start_time::time <= cs.start_time::time
      AND za.end_time::time >= cs.end_time::time
      AND (
        (za.kind = 'date' AND za.override_date = cs.session_date)
        OR (
          za.kind = 'weekly'
          AND za.weekday = EXTRACT(DOW FROM cs.session_date)::int
          AND NOT EXISTS (
            SELECT 1 FROM public.coach_availability_zones d
            WHERE d.coach_id = cs.coach_id AND d.kind = 'date' AND d.override_date = cs.session_date
          )
        )
      )
    ORDER BY (za.kind = 'date') DESC
    LIMIT 1
  ) z
  WHERE ct.slug = '1on4'
    AND cs.level_min IS NULL
    AND cs.status IN ('open', 'full')
    AND cs.session_date >= (now() AT TIME ZONE 'America/Los_Angeles')::date
)
UPDATE public.class_sessions cs
SET level_min = band.group_level_min,
    level_max = band.group_level_max
FROM band
WHERE cs.id = band.id;

-- Verification: upcoming group sessions still without a band. Expect 0 rows,
-- or only sessions whose zone itself has no band (or a coach with no zones).
SELECT cs.id, cs.coach_id, cs.session_date, cs.start_time, cs.end_time
FROM public.class_sessions cs
JOIN public.course_types ct ON ct.id = cs.course_type_id
WHERE ct.slug = '1on4'
  AND cs.level_min IS NULL
  AND cs.status IN ('open', 'full')
  AND cs.session_date >= (now() AT TIME ZONE 'America/Los_Angeles')::date
ORDER BY cs.session_date, cs.start_time;
