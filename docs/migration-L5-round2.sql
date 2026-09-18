-- ============================================================
-- Manta Shark Aquatics — Level 5 第二輪
--
-- 業主決定：
--   新增  蛙式 10 碼（階段2）—— 蛙腿 25 碼 底下，開始教抱水和換氣
--   新增  自手蝶腳（階段1）—— 自由式划手配蝶式打水，一次推水兩次打水
--   新增  單手蝶式（階段2）—— 掛在 自手蝶腳 底下
--   開放式轉身 → 階段3，改掛 蛙式 10 碼
--   停用  憋氣 15 秒
--
-- 改完的 L5（9 個技能）：
--   階段1  自由式 50 碼、仰式 50 碼、蛙腿 25 碼、自手蝶腳
--   階段2  自由式 100 碼、蛙式 10 碼、單手蝶式
--   階段3  自由式翻滾轉身、開放式轉身
-- 五條線全是直的。
--
-- 牽動到的前置（在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份）：
--   L5 開放式轉身  原本 蛙腿 25 碼 → 改掛 蛙式 10 碼
--   L6 蛙式 15 碼  原本 蛙腿 25 碼 → 改掛 蛙式 10 碼（中間多了一步）
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 停用 ----------
UPDATE public.skills SET is_active = false
WHERE id = '0b50339e-3764-40f3-8d12-fa53502831ec';   -- 憋氣 15 秒

DELETE FROM public.skill_prerequisites
WHERE requires_id = '0b50339e-3764-40f3-8d12-fa53502831ec'
   OR skill_id    = '0b50339e-3764-40f3-8d12-fa53502831ec';

-- ---------- 2. 新增三個技能 ----------
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT 'ee7b11f4-bb68-4868-95c9-62270c9ae576', l.id, 'Breaststroke 10 yd', 2, 2, true,
       'Breaststroke 10 yards keeping the order pull, breathe, kick, glide, the pull staying in front of the shoulders. 蛙式 10 碼，保持「划、吸、蹬、滑」的順序，抱水不拉到肩膀後面。'
  FROM public.levels l WHERE l.level_number = 5
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT '8aadc967-9b3f-430b-b161-273001ffa21a', l.id, 'Freestyle Arms, Dolphin Kick', 1, 4, true,
       '25 yards with freestyle arms and a butterfly kick, two kicks to every pull, the rhythm holding the whole way. 自由式划手配蝶式打水 25 碼，一次推水配兩次打水，節奏全程不亂。'
  FROM public.levels l WHERE l.level_number = 5
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT '6d6b06d9-7b44-4980-a1a6-a4ab887d5ede', l.id, 'Single-Arm Butterfly', 2, 3, true,
       'Single-arm butterfly 15 yards each side, the other arm extended out front, two kicks to the pull and the chin leading out for the breath. 單手蝶式 15 碼，左右各一趟；另一隻手伸直在前面，一划兩踢，換氣時下巴先出水。'
  FROM public.levels l WHERE l.level_number = 5
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

-- ---------- 3. 階段與順序 ----------
UPDATE public.skills SET stage = 1, sort_order = 1 WHERE id = 'be760433-09d7-4cac-9863-fa758abc9009';  -- 自由式 50 碼
UPDATE public.skills SET stage = 1, sort_order = 2 WHERE id = '97804fbb-13d4-4367-ab9d-0276b25591d6';  -- 仰式 50 碼
UPDATE public.skills SET stage = 1, sort_order = 3 WHERE id = 'e858562b-a3aa-4875-84ef-e1f6875770e5';  -- 蛙腿 25 碼
UPDATE public.skills SET stage = 1, sort_order = 4 WHERE id = '8aadc967-9b3f-430b-b161-273001ffa21a';  -- 自手蝶腳

UPDATE public.skills SET stage = 2, sort_order = 1 WHERE id = '18a6462c-4c67-4e93-8838-8bc03717b463';  -- 自由式 100 碼
UPDATE public.skills SET stage = 2, sort_order = 2 WHERE id = 'ee7b11f4-bb68-4868-95c9-62270c9ae576';  -- 蛙式 10 碼
UPDATE public.skills SET stage = 2, sort_order = 3 WHERE id = '6d6b06d9-7b44-4980-a1a6-a4ab887d5ede';  -- 單手蝶式

UPDATE public.skills SET stage = 3, sort_order = 1 WHERE id = '22e00423-edc5-4626-8e7f-8bc4e846203f';  -- 自由式翻滾轉身
UPDATE public.skills SET stage = 3, sort_order = 2 WHERE id = '0ff7355f-2cef-42b9-afa2-0749603d6c33';  -- 開放式轉身

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L5 應該是 9 個技能：
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 5 and s.is_active
--  order by s.stage, s.sort_order;
