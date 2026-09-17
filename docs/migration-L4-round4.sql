-- ============================================================
-- Manta Shark Aquatics — Level 4 第四輪：兩個自由式技術游
--
-- 業主決定：
--   新增  自由式技術游（右二左二）  階段3，掛 自由式 25 碼
--   新增  自由式技術游（單手轉肩游）階段3，掛 自由式 25 碼
--   蝶式打水 25 碼 排到階段3 最右邊（蛙腿 10 碼 正下方），不連線
--
-- 階段3 從左到右：
--   自由式技術游（右二左二）、自由式技術游（單手轉肩游）、仰式 25 碼、蝶式打水 25 碼
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT 'ecbcc8c6-dedd-4ebf-8e48-b6eb53e17aeb', l.id, 'Freestyle Drill: Two Right, Two Left', 3, 1, true,
       '25 yards alternating two strokes with the right arm and two with the left, the other arm extended out front and waiting, both strokes on a side looking the same. 右手連續划兩下、左手連續划兩下交替，游 25 碼；沒在划的那隻手伸直在前面等，同一邊的兩下動作一樣。'
  FROM public.levels l WHERE l.level_number = 4
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT '6b94b35a-4890-4ffb-ad7e-f8b630415c8b', l.id, 'Freestyle Drill: Single-Arm with Rotation', 3, 2, true,
       '25 yards each side with one arm extended out front and only the other swimming, the working shoulder rolling clear of the water and the breath taken to that side. 一手伸直在前面不動、只用另一手游 25 碼，左右各一趟；划手那一邊的肩膀要轉出水面，換氣跟著那隻手。'
  FROM public.levels l WHERE l.level_number = 4
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

UPDATE public.skills SET stage = 3, sort_order = 3 WHERE id = '6bf527f0-5e39-48bb-b975-6e29829b5d7c';  -- 仰式 25 碼
UPDATE public.skills SET stage = 3, sort_order = 4 WHERE id = '327265d2-e212-4917-90d9-21daa2a5520e';  -- 蝶式打水 25 碼

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L4 應該是 12 個技能：
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 4 and s.is_active
--  order by s.stage, s.sort_order;
