-- ============================================================
-- Manta Shark Aquatics — swim-team bands become stage-aware
--
--   Junior        L4 stage 1  ->  L5 stage 3
--   Intermediate  L6 stage 1  ->  L7 stage 1
--   Elite         L7 stage 2  ->  L7 stage 3
--
-- Level 7 is the top of the curriculum, so under level-only bands Elite was a
-- place you arrive at and never leave. Splitting L7 at stage 2 gives the
-- strongest swimmers something still to earn, and evens out three squads that
-- otherwise covered two levels, one level and one level.
--
-- Run the whole file in the Supabase SQL editor. One transaction.
-- ============================================================
BEGIN;

ALTER TABLE public.team_tiers ADD COLUMN IF NOT EXISTS min_stage smallint NOT NULL DEFAULT 1;
ALTER TABLE public.team_tiers ADD COLUMN IF NOT EXISTS max_stage smallint NOT NULL DEFAULT 3;
ALTER TABLE public.team_tiers DROP CONSTRAINT IF EXISTS team_tiers_stage_check;
ALTER TABLE public.team_tiers ADD  CONSTRAINT team_tiers_stage_check
  CHECK (min_stage BETWEEN 1 AND 3 AND max_stage BETWEEN 1 AND 3);

-- Bands, by id so a rename can never point these at the wrong squad.
UPDATE public.team_tiers SET level_min = 4, min_stage = 1, level_max = 5, max_stage = 3
  WHERE id = '638702cb-a2e7-4961-94dc-bca1b17bda83';  -- Junior Team
UPDATE public.team_tiers SET level_min = 6, min_stage = 1, level_max = 7, max_stage = 1
  WHERE id = 'f5737be6-c2ee-4e31-83e1-dbcf9b8aa68b';  -- Intermediate Team
UPDATE public.team_tiers SET level_min = 7, min_stage = 2, level_max = 7, max_stage = 3
  WHERE id = '74d3c84f-62c6-48d0-97b5-77c5289cd5cb';  -- Elite Team

COMMIT;

-- ---------- who is now in the wrong squad ----------
-- Bands decide which squad a swimmer JOINS. They do not move anyone who is
-- already on a team, and practice times are keyed to the squad — so a swimmer
-- left in the wrong one turns up at the wrong session. Run this and look.
--
-- select s.full_name, s.current_level as lvl, s.current_stage as stg,
--        now_t.name as current_squad, want.name as should_be
--   from team_memberships tm
--   join students s on s.id = tm.student_id
--   left join team_tiers now_t on now_t.id = tm.team_tier_id
--   left join team_tiers want on want.active
--        and (s.current_level * 10 + coalesce(s.current_stage, 1))
--            between (want.level_min * 10 + want.min_stage)
--                and (want.level_max * 10 + want.max_stage)
--  where tm.status in ('active', 'past_due')
--    and (want.id is null or want.id <> tm.team_tier_id);
--
-- To move one swimmer after checking:
-- update team_memberships set team_tier_id = '<want.id>', updated_at = now()
--  where id = '<membership id>';
