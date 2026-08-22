-- ============================================================
-- Manta Shark Aquatics — curriculum migration
--   9 levels x 8 skills (72)  ->  7 levels x 3 stages (79)
-- Run this whole file in the Supabase SQL editor. It is one
-- transaction: if anything fails, nothing is applied.
-- ============================================================
BEGIN;

-- ---------- 1. schema ----------
ALTER TABLE public.skills   ADD COLUMN IF NOT EXISTS stage         smallint NOT NULL DEFAULT 1;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS current_stage smallint          DEFAULT 1;
ALTER TABLE public.level_upgrades ADD COLUMN IF NOT EXISTS from_stage smallint;
ALTER TABLE public.level_upgrades ADD COLUMN IF NOT EXISTS to_stage   smallint;
ALTER TABLE public.skills   DROP CONSTRAINT IF EXISTS skills_stage_check;
ALTER TABLE public.skills   ADD  CONSTRAINT skills_stage_check CHECK (stage BETWEEN 1 AND 3);
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_current_stage_check;
ALTER TABLE public.students ADD  CONSTRAINT students_current_stage_check CHECK (current_stage BETWEEN 1 AND 3);

-- level ceiling drops 9 -> 7; release the old checks first
ALTER TABLE public.levels   DROP CONSTRAINT IF EXISTS levels_level_number_check;
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_current_level_check;

-- ---------- 2. level names ----------
UPDATE public.levels SET name = 'Level 1 — Water Discovery' WHERE level_number = 1;
UPDATE public.levels SET name = 'Level 2 — Water Confidence' WHERE level_number = 2;
UPDATE public.levels SET name = 'Level 3 — Independent Movement' WHERE level_number = 3;
UPDATE public.levels SET name = 'Level 4 — Stroke Foundations' WHERE level_number = 4;
UPDATE public.levels SET name = 'Level 5 — Stroke Development' WHERE level_number = 5;
UPDATE public.levels SET name = 'Level 6 — Four Strokes'   WHERE level_number = 6;
UPDATE public.levels SET name = 'Level 7 — Competitive Swimming' WHERE level_number = 7;

-- ---------- 3. reassign the 72 existing skills ----------
-- (skill ids are unchanged, so every student_skill_progress row survives)

--   Level 1 — Water Discovery (認識水)
UPDATE public.skills SET level_id = '11cb28cf-df84-4c36-85c0-f95e66bf95de', stage = 1, sort_order = 1 WHERE id = '3aa56665-8ce2-4524-819d-efcf30057a02';  -- Safe Entry and Recognition
UPDATE public.skills SET level_id = '11cb28cf-df84-4c36-85c0-f95e66bf95de', stage = 1, sort_order = 2 WHERE id = 'f0b828a0-63a5-4aea-8000-13e1b05b1682';  -- Safe Exit
UPDATE public.skills SET level_id = '11cb28cf-df84-4c36-85c0-f95e66bf95de', stage = 1, sort_order = 3 WHERE id = 'a5ec094e-4338-4259-9e43-4b913cd02ca3';  -- Wall Grasping
UPDATE public.skills SET level_id = '11cb28cf-df84-4c36-85c0-f95e66bf95de', stage = 2, sort_order = 1 WHERE id = '58842492-eacd-4c4d-9506-a18e562c64b5';  -- Water Walking
UPDATE public.skills SET level_id = '11cb28cf-df84-4c36-85c0-f95e66bf95de', stage = 2, sort_order = 2 WHERE id = '0d151d1b-8492-49bc-824e-c4e26a657046';  -- Underwater Bubble Blowing
UPDATE public.skills SET level_id = '11cb28cf-df84-4c36-85c0-f95e66bf95de', stage = 2, sort_order = 3 WHERE id = '2eb2c769-054f-4e44-9769-779c7972318b';  -- Kicking on Land
UPDATE public.skills SET level_id = '11cb28cf-df84-4c36-85c0-f95e66bf95de', stage = 3, sort_order = 1 WHERE id = '92751613-6a3c-465f-bcdb-251754df1dff';  -- Assisted Floating
UPDATE public.skills SET level_id = '11cb28cf-df84-4c36-85c0-f95e66bf95de', stage = 3, sort_order = 2 WHERE id = '52ad780b-a73d-418d-988f-f49651cbc088';  -- Float-to-Stand Transition
UPDATE public.skills SET level_id = '11cb28cf-df84-4c36-85c0-f95e66bf95de', stage = 3, sort_order = 3 WHERE id = 'd6915327-5d9d-4907-be40-b59ad3536c8d';  -- Superman Glide

--   Level 2 — Water Confidence (水中自在)
UPDATE public.skills SET level_id = 'a7508f3b-90e1-442a-9543-c2ee39ece05a', stage = 1, sort_order = 1 WHERE id = '4fd1fce7-9293-475e-a142-5a8d2ecf954d';  -- Freestyle Kicking (Basic)
UPDATE public.skills SET level_id = 'a7508f3b-90e1-442a-9543-c2ee39ece05a', stage = 1, sort_order = 2 WHERE id = '77dcafb5-fee7-4fde-8020-9691b99f5064';  -- Backstroke Kicking (Basic)
UPDATE public.skills SET level_id = 'a7508f3b-90e1-442a-9543-c2ee39ece05a', stage = 1, sort_order = 3 WHERE id = 'b46c9773-7e09-4da4-8beb-d79050075710';  -- Push-Off Float
UPDATE public.skills SET level_id = 'a7508f3b-90e1-442a-9543-c2ee39ece05a', stage = 2, sort_order = 1 WHERE id = 'ed4c463b-6c65-497b-b370-18e9bd945468';  -- BBQ Roll (Body Rotation)
UPDATE public.skills SET level_id = 'a7508f3b-90e1-442a-9543-c2ee39ece05a', stage = 2, sort_order = 2 WHERE id = '35250d84-1461-4c39-85fc-7686d9576753';  -- Bubble Jumps (Basic)
UPDATE public.skills SET level_id = 'a7508f3b-90e1-442a-9543-c2ee39ece05a', stage = 2, sort_order = 3 WHERE id = '084fe3dd-cbe3-485c-82d6-dcdd2cd56ae7';  -- Underwater Breath Holding
UPDATE public.skills SET level_id = 'a7508f3b-90e1-442a-9543-c2ee39ece05a', stage = 3, sort_order = 1 WHERE id = 'ed0e69e4-3edb-4668-84d8-a39064fe2425';  -- Object Retrieval
UPDATE public.skills SET level_id = 'a7508f3b-90e1-442a-9543-c2ee39ece05a', stage = 3, sort_order = 2 WHERE id = '1b90e0d5-e21d-4991-9d97-a16394d3913b';  -- Starfish Float (Basic)
UPDATE public.skills SET level_id = 'a7508f3b-90e1-442a-9543-c2ee39ece05a', stage = 3, sort_order = 3 WHERE id = 'c7022acb-3075-471f-8c45-4d5330139369';  -- Bubble Jumps (Advanced)

--   Level 3 — Independent Movement (獨立前進)
UPDATE public.skills SET level_id = 'd43bd4ad-818a-47cc-b984-340f1a86778e', stage = 1, sort_order = 1 WHERE id = 'e8fd87dc-4e41-4ea5-adda-d8038881f573';  -- Freestyle Kicking (Advanced)
UPDATE public.skills SET level_id = 'd43bd4ad-818a-47cc-b984-340f1a86778e', stage = 1, sort_order = 2 WHERE id = '4a0a72ff-a39f-404c-a40f-49b83b5ea4ff';  -- Backstroke Kicking (Advanced)
UPDATE public.skills SET level_id = 'd43bd4ad-818a-47cc-b984-340f1a86778e', stage = 1, sort_order = 3 WHERE id = '89ca69a6-6f96-4c1d-a52d-6ba16edab33b';  -- Streamline Push-Off
UPDATE public.skills SET level_id = 'd43bd4ad-818a-47cc-b984-340f1a86778e', stage = 2, sort_order = 1 WHERE id = '4dd3928b-8433-40c4-8057-29b454ce5a03';  -- Treading Water (Basic)
UPDATE public.skills SET level_id = 'd43bd4ad-818a-47cc-b984-340f1a86778e', stage = 2, sort_order = 2 WHERE id = '9194c9af-7e03-4d13-969b-4284d49b3a84';  -- Deep Water Object Retrieval
UPDATE public.skills SET level_id = 'd43bd4ad-818a-47cc-b984-340f1a86778e', stage = 2, sort_order = 3 WHERE id = '997642b0-c290-48cf-a53f-ccb46d52d539';  -- Water Safety Test
UPDATE public.skills SET level_id = 'd43bd4ad-818a-47cc-b984-340f1a86778e', stage = 3, sort_order = 1 WHERE id = '580a979a-e3f7-458f-b0f8-c39c7c20d686';  -- BBQ Swim Technique
UPDATE public.skills SET level_id = 'd43bd4ad-818a-47cc-b984-340f1a86778e', stage = 3, sort_order = 2 WHERE id = '7a62a560-01cd-4199-b464-68a78a8ee98a';  -- In-Water Turn
UPDATE public.skills SET level_id = 'd43bd4ad-818a-47cc-b984-340f1a86778e', stage = 3, sort_order = 3 WHERE id = '5aa1716e-8d05-41b0-a660-7fce60b69390';  -- Butterfly Kicking (Basic)

--   Level 4 — Stroke Foundations (泳姿基礎)
UPDATE public.skills SET level_id = 'ed7884c1-bf10-4725-830a-981ee8b52246', stage = 1, sort_order = 1 WHERE id = 'dff814b2-90df-4043-a4e3-dd4e4df64fbe';  -- Freestyle (Basic)
UPDATE public.skills SET level_id = 'ed7884c1-bf10-4725-830a-981ee8b52246', stage = 1, sort_order = 2 WHERE id = '91e61121-5528-456b-9e7d-b97953ed0c39';  -- Freestyle (Advanced)
UPDATE public.skills SET level_id = 'ed7884c1-bf10-4725-830a-981ee8b52246', stage = 2, sort_order = 1 WHERE id = '96c47b53-df33-4b4a-9a8e-a84eed10c7b8';  -- Backstroke (Basic)
UPDATE public.skills SET level_id = 'ed7884c1-bf10-4725-830a-981ee8b52246', stage = 2, sort_order = 2 WHERE id = '818b6b3b-63b9-4e13-9a52-f3f466f57cc7';  -- Streamline Freestyle Kicking
UPDATE public.skills SET level_id = 'ed7884c1-bf10-4725-830a-981ee8b52246', stage = 2, sort_order = 3 WHERE id = '9722f505-b208-43dc-868d-495ba0f3c10e';  -- Underwater Freestyle Kicking
UPDATE public.skills SET level_id = 'ed7884c1-bf10-4725-830a-981ee8b52246', stage = 3, sort_order = 1 WHERE id = '806e2b61-f66e-460b-b31b-264097fee097';  -- Starfish Float (Advanced)
UPDATE public.skills SET level_id = 'ed7884c1-bf10-4725-830a-981ee8b52246', stage = 3, sort_order = 2 WHERE id = 'b4e9ff8e-535c-4e5e-bc9a-8ceb9c252113';  -- Treading Water (Advanced)
UPDATE public.skills SET level_id = 'ed7884c1-bf10-4725-830a-981ee8b52246', stage = 3, sort_order = 3 WHERE id = '95bf3bc3-79b3-48a4-9a90-cf53103ca965';  -- No-Goggles Swim
UPDATE public.skills SET level_id = 'ed7884c1-bf10-4725-830a-981ee8b52246', stage = 3, sort_order = 4 WHERE id = '81568486-d273-49b0-a824-d53569fefc37';  -- Clothed Swim Without Goggles

--   Level 5 — Stroke Development (泳姿發展)
UPDATE public.skills SET level_id = '83479c5f-2ca6-45db-a09b-d2aaa919162b', stage = 1, sort_order = 1 WHERE id = 'be760433-09d7-4cac-9863-fa758abc9009';  -- Freestyle (Mastery)
UPDATE public.skills SET level_id = '83479c5f-2ca6-45db-a09b-d2aaa919162b', stage = 1, sort_order = 2 WHERE id = '18a6462c-4c67-4e93-8838-8bc03717b463';  -- Freestyle (Proficiency)
UPDATE public.skills SET level_id = '83479c5f-2ca6-45db-a09b-d2aaa919162b', stage = 2, sort_order = 1 WHERE id = 'daefdc4c-aa3f-4df6-b001-4e95569c4d78';  -- Backstroke (Advanced)
UPDATE public.skills SET level_id = '83479c5f-2ca6-45db-a09b-d2aaa919162b', stage = 2, sort_order = 2 WHERE id = '97804fbb-13d4-4367-ab9d-0276b25591d6';  -- Backstroke (Mastery)
UPDATE public.skills SET level_id = '83479c5f-2ca6-45db-a09b-d2aaa919162b', stage = 2, sort_order = 3 WHERE id = '22e00423-edc5-4626-8e7f-8bc4e846203f';  -- Freestyle Flip Turn
UPDATE public.skills SET level_id = '83479c5f-2ca6-45db-a09b-d2aaa919162b', stage = 3, sort_order = 1 WHERE id = 'b02f51e3-1e69-487e-86b1-18e21ddb6812';  -- Breaststroke Kick (Basic)
UPDATE public.skills SET level_id = '83479c5f-2ca6-45db-a09b-d2aaa919162b', stage = 3, sort_order = 2 WHERE id = 'e858562b-a3aa-4875-84ef-e1f6875770e5';  -- Breaststroke Kick (Advanced)
UPDATE public.skills SET level_id = '83479c5f-2ca6-45db-a09b-d2aaa919162b', stage = 3, sort_order = 3 WHERE id = '327265d2-e212-4917-90d9-21daa2a5520e';  -- Butterfly Kicking (Advanced)
UPDATE public.skills SET level_id = '83479c5f-2ca6-45db-a09b-d2aaa919162b', stage = 3, sort_order = 4 WHERE id = '0b50339e-3764-40f3-8d12-fa53502831ec';  -- Underwater Breath Holding (Advanced)

--   Level 6 — Four Strokes (四式完成)
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 1, sort_order = 1 WHERE id = '31dc4fc7-ef0b-4e4c-a80c-419ceebc7360';  -- Butterfly (Basic)
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 1, sort_order = 2 WHERE id = '9f37e0f9-68d5-4bae-8349-c9d2d99d8225';  -- Breaststroke (Basic)
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 1, sort_order = 3 WHERE id = 'b7525cfb-5d9b-43b2-9868-393578adf991';  -- Individual Medley Kicking
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 1, sort_order = 4 WHERE id = '3c01a30f-147d-4880-9738-75c245fc3325';  -- Treading Water (Proficient)
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 2, sort_order = 1 WHERE id = '456f3041-33b2-4583-9f0a-4543ca2464c0';  -- Freestyle (Endurance)
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 2, sort_order = 2 WHERE id = 'fe6b4f6e-cfa9-4cfe-979a-6cd3cf6d5af9';  -- Backstroke (Proficiency)
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 2, sort_order = 3 WHERE id = '3e66c970-61b6-4189-9fa8-353809086556';  -- Backstroke Flip Turn
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 3, sort_order = 1 WHERE id = 'eb420091-b357-41af-892a-73a1059ecfda';  -- Butterfly (Advanced)
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 3, sort_order = 2 WHERE id = '1b7d1a52-bac5-44a5-9bc4-18a7ab70903f';  -- Breaststroke (Advanced)
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 3, sort_order = 3 WHERE id = '61765b4c-fd81-458d-acb9-1f4c19201994';  -- Underwater Dolphin Kick
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 3, sort_order = 4 WHERE id = '0ff7355f-2cef-42b9-afa2-0749603d6c33';  -- Open Turn
UPDATE public.skills SET level_id = '627c3128-814c-481c-9925-7b435a2a6dc4', stage = 3, sort_order = 5 WHERE id = 'e9374f19-259b-4c49-85c2-a6faebae05e9';  -- Clothed Swim Without Goggles

--   Level 7 — Competitive Swimming (競技規格)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 1, sort_order = 1 WHERE id = 'c4b854b3-f337-4799-9631-33c6459951c6';  -- Freestyle (Timed)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 1, sort_order = 2 WHERE id = '0280911e-9a79-4eed-8916-883e64dee3de';  -- Freestyle (Sprint)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 1, sort_order = 3 WHERE id = 'eaa47012-b0e4-4e77-ba05-f87b6acc80db';  -- Freestyle (Advanced Endurance)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 1, sort_order = 4 WHERE id = '840dbdc7-1774-46ce-95ca-fe2f87d23475';  -- Backstroke (Endurance)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 1, sort_order = 5 WHERE id = '91adaea7-aefa-432c-8b9a-44ca43976bdb';  -- Clothed Swim Without Goggles
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 2, sort_order = 1 WHERE id = 'fb34523b-58c7-4e1f-9cef-a56ebea37757';  -- Breaststroke Underwater Pullout
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 2, sort_order = 2 WHERE id = 'de916eb5-53b3-4ab3-b451-53f793a1666f';  -- Breaststroke (Mastery)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 2, sort_order = 3 WHERE id = 'c9047d9f-1b91-4902-a4ce-33e303b4674b';  -- Butterfly (Mastery)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 2, sort_order = 4 WHERE id = 'a8d00e21-01af-4ad5-a90d-a7e8bd59e6a8';  -- Freestyle (Long Distance)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 3, sort_order = 1 WHERE id = '58b20bb7-23a5-4ee2-affb-5f16284a7563';  -- Stroke Transitions and Turns
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 3, sort_order = 2 WHERE id = 'e9f7b834-3e50-446f-a775-33d547ba776b';  -- Individual Medley
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 3, sort_order = 3 WHERE id = '6d6b6afb-ed92-47b1-b557-52904c7931ab';  -- Freestyle (Competitive)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 3, sort_order = 4 WHERE id = '11f3d107-8ea1-43f9-9301-3875cd71dad0';  -- Backstroke (Competitive)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 3, sort_order = 5 WHERE id = '1ed417e9-431d-46db-837b-adabbdde74f3';  -- Breaststroke (Competitive)
UPDATE public.skills SET level_id = '4469a2ca-f251-40d6-a280-3b1df7fb15a1', stage = 3, sort_order = 6 WHERE id = 'b617a73c-8da4-4526-9420-58ed4c682a94';  -- Butterfly (Competitive)

-- ---------- 4. rename the three identical "Clothed Swim Without Goggles" ----------
UPDATE public.skills SET name = 'Clothed Swim (7 yd)' WHERE id = '81568486-d273-49b0-a824-d53569fefc37';
UPDATE public.skills SET name = 'Clothed Swim (25 yd)' WHERE id = 'e9374f19-259b-4c49-85c2-a6faebae05e9';
UPDATE public.skills SET name = 'Clothed Swim (50 yd)' WHERE id = '91adaea7-aefa-432c-8b9a-44ca43976bdb';

-- ---------- 5. seven new skills ----------
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active) VALUES
  ('b1a0c2d4-5e6f-4a71-8b92-0c1d2e3f4a51', 'a7508f3b-90e1-442a-9543-c2ee39ece05a', 'Sculling (Basic)', 3, 4, true)
  ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
    stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true;
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active) VALUES
  ('b2a0c2d4-5e6f-4a72-8b92-0c1d2e3f4a52', 'd43bd4ad-818a-47cc-b984-340f1a86778e', 'Survival Float', 2, 4, true)
  ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
    stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true;
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active) VALUES
  ('b3a0c2d4-5e6f-4a73-8b92-0c1d2e3f4a53', 'ed7884c1-bf10-4725-830a-981ee8b52246', 'Seated and Kneeling Dive', 1, 3, true)
  ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
    stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true;
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active) VALUES
  ('b4a0c2d4-5e6f-4a74-8b92-0c1d2e3f4a54', '83479c5f-2ca6-45db-a09b-d2aaa919162b', 'Surface Dive', 2, 4, true)
  ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
    stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true;
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active) VALUES
  ('b5a0c2d4-5e6f-4a75-8b92-0c1d2e3f4a55', '83479c5f-2ca6-45db-a09b-d2aaa919162b', 'Reach and Throw Rescue', 3, 5, true)
  ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
    stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true;
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active) VALUES
  ('b6a0c2d4-5e6f-4a76-8b92-0c1d2e3f4a56', '627c3128-814c-481c-9925-7b435a2a6dc4', 'Standing Dive', 2, 4, true)
  ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
    stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true;
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active) VALUES
  ('b7a0c2d4-5e6f-4a77-8b92-0c1d2e3f4a57', '4469a2ca-f251-40d6-a280-3b1df7fb15a1', 'Racing Start and Backstroke Start', 2, 5, true)
  ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
    stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true;

-- ---------- 6. move students off the retired levels 8 and 9 ----------
-- Old level -> new level. Nobody is demoted more than one level; edit the
-- CASE if you want a particular student placed differently.
UPDATE public.students SET current_level = CASE current_level
    WHEN 1 THEN 1
    WHEN 2 THEN 2
    WHEN 3 THEN 3
    WHEN 4 THEN 4
    WHEN 5 THEN 5
    WHEN 6 THEN 5
    WHEN 7 THEN 6
    WHEN 8 THEN 7
    WHEN 9 THEN 7
    ELSE current_level END
  WHERE current_level IS NOT NULL;

-- Stage is derived from work already recorded: the first stage of the
-- student's level that is not yet fully signed off.
UPDATE public.students s SET current_stage = COALESCE((
    SELECT MIN(sk.stage) FROM public.skills sk
    JOIN public.levels l ON l.id = sk.level_id
    WHERE l.level_number = s.current_level AND sk.is_active
      AND NOT EXISTS (SELECT 1 FROM public.student_skill_progress ssp
                      WHERE ssp.student_id = s.id AND ssp.skill_id = sk.id
                        AND ssp.progress_percent = 100)
  ), 1)
  WHERE s.current_level IS NOT NULL;

-- ---------- 7. level bands that pointed at 8 / 9 ----------
-- Group-class zones: the old 7–9 band becomes 7–7.
UPDATE public.coach_availability_zones SET group_level_max = 7 WHERE group_level_max > 7;
UPDATE public.coach_availability_zones SET group_level_min = 7 WHERE group_level_min > 7;

-- Swim-team tiers were 4–5 / 6–7 / 8–9 across nine levels. Over seven they
-- become 4–5 / 6 / 7. CHECK THIS AGAINST WHO IS ACTUALLY ON EACH TEAM.
UPDATE public.team_tiers SET level_min = 4, level_max = 5 WHERE level_min = 4;
UPDATE public.team_tiers SET level_min = 6, level_max = 6 WHERE level_min = 6;
UPDATE public.team_tiers SET level_min = 7, level_max = 7 WHERE level_min = 8;

-- ---------- 8. retire levels 8 and 9 ----------
DELETE FROM public.levels WHERE level_number IN (8, 9);

-- ---------- 9. re-apply the checks at the new ceiling ----------
ALTER TABLE public.levels   ADD CONSTRAINT levels_level_number_check
  CHECK (level_number >= 1 AND level_number <= 7);
ALTER TABLE public.students ADD CONSTRAINT students_current_level_check
  CHECK (current_level >= 1 AND current_level <= 7);

-- ---------- 10. promotion now runs stage by stage ----------
CREATE OR REPLACE FUNCTION public.check_level_upgrade() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_level_id     UUID;
  v_level_number INTEGER;
  v_stage        SMALLINT;
  v_cur_level    INTEGER;
  v_cur_stage    SMALLINT;
  v_total        INTEGER;
  v_done         INTEGER;
BEGIN
  IF NEW.progress_percent < 100 THEN
    RETURN NEW;
  END IF;

  SELECT sk.level_id, l.level_number, sk.stage
    INTO v_level_id, v_level_number, v_stage
    FROM skills sk JOIN levels l ON l.id = sk.level_id
   WHERE sk.id = NEW.skill_id;

  SELECT current_level, COALESCE(current_stage, 1)
    INTO v_cur_level, v_cur_stage
    FROM students WHERE id = NEW.student_id;

  -- only the stage the student is actually sitting in can promote them
  IF v_cur_level IS NULL OR v_cur_level <> v_level_number OR v_cur_stage <> v_stage THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM skills WHERE level_id = v_level_id AND stage = v_stage AND is_active = TRUE;

  SELECT COUNT(*) INTO v_done
    FROM student_skill_progress ssp
    JOIN skills sk ON sk.id = ssp.skill_id
   WHERE ssp.student_id = NEW.student_id
     AND sk.level_id = v_level_id AND sk.stage = v_stage AND sk.is_active = TRUE
     AND ssp.progress_percent = 100;

  IF v_total = 0 OR v_done < v_total THEN
    RETURN NEW;
  END IF;

  -- Stages advance on their own. Moving up a LEVEL deliberately does not:
  -- that stays a coach recommendation an admin approves, and the approval
  -- route is what sets current_level and puts the swimmer back on stage 1.
  -- A swimmer who finishes stage 3 simply waits there at 100%.
  IF v_stage < 3 THEN
    UPDATE students SET current_stage = v_stage + 1 WHERE id = NEW.student_id;
    INSERT INTO level_upgrades (student_id, from_level, to_level, from_stage, to_stage, upgraded_by)
    VALUES (NEW.student_id, v_cur_level, v_cur_level, v_stage, v_stage + 1, NEW.last_updated_by);
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- ---------- sanity check (run after COMMIT) ----------
-- select l.level_number, sk.stage, count(*)
--   from skills sk join levels l on l.id = sk.level_id
--  where sk.is_active group by 1,2 order by 1,2;
-- expected: 79 rows total, 3 stages on every one of 7 levels
