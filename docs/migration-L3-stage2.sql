-- ============================================================
-- Manta Shark Aquatics — Level 3 階段 2 改版
--
-- 業主決定：
--   停用   踩水 30 秒、求生漂浮
--   新增   自由式打水 10 碼（無浮板抬頭換氣）—— 階段 2，佔踩水原本的位置
--          側邊打水 —— 階段 2，佔求生漂浮原本的位置
--
-- 「停用」不是刪除：資料列留著，is_active = false。已經打過這兩個技能的
-- 學生成績因此不會消失，學習地圖和教練端則不再顯示它們。
--
-- 踩水 30 秒 不是改名成新技能，是停用再開一個新的：兩者教的東西完全不同，
-- 直接改名會讓已經拿到「踩水 30 秒」的學生變成拿到「自由式打水 10 碼」。
--
-- 這兩個技能原本是別人的前置，一起清掉：
--   L3 水域安全測驗   少了 求生漂浮、踩水 30 秒 → 只剩 深水撿物、跳入胸深水
--   L4 踩水 1 分鐘    原本只掛 踩水 30 秒 → 改掛 深水撿物
--   L4 水中自保驗收   少了 求生漂浮 → 只剩 踩水 1 分鐘、大字漂 30 秒
-- 這些都在 docs/migration-skill-prerequisites.sql 裡（先跑這份，再跑那份）。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 停用 ----------
UPDATE public.skills SET is_active = false
WHERE id = '4dd3928b-8433-40c4-8057-29b454ce5a03';   -- 踩水 30 秒

UPDATE public.skills SET is_active = false
WHERE id = 'b2a0c2d4-5e6f-4a72-8b92-0c1d2e3f4a52';   -- 求生漂浮

-- 停用的技能不能再當別人的前置，先把指向它們的關係清掉，
-- 不然下一份前置 migration 會踩到已經停用的列。
DELETE FROM public.skill_prerequisites
WHERE requires_id IN ('4dd3928b-8433-40c4-8057-29b454ce5a03',
                      'b2a0c2d4-5e6f-4a72-8b92-0c1d2e3f4a52')
   OR skill_id    IN ('4dd3928b-8433-40c4-8057-29b454ce5a03',
                      'b2a0c2d4-5e6f-4a72-8b92-0c1d2e3f4a52');

-- ---------- 2. 新增兩個技能 ----------
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT '9ac7c46d-2f0f-495b-a0cc-95a13e6684fc', l.id, 'Freestyle Kick 10 yd, No Board', 2, 1, true,
       'Kicks 10 yards with no board, arms extended in front, lifting the head to breathe and putting the face straight back in, kick never stopping. 不拿浮板、雙手往前伸直打水 10 碼；換氣時抬頭吸一口就把臉放回水裡，腳全程不停。'
  FROM public.levels l WHERE l.level_number = 3
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT '6d8d921a-e413-4bf9-81d6-a1930dab3404', l.id, 'Side Kick', 2, 3, true,
       'Kicks 10 yards on the side, bottom arm extended, top arm on the thigh, shoulders stacked and the head still. Both sides. 側躺打水 10 碼，下面的手往前伸直、上面的手貼大腿，兩邊肩膀疊在一起、頭不動。左右兩邊都要做。'
  FROM public.levels l WHERE l.level_number = 3
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

-- ---------- 3. 階段 2 的順序 ----------
-- 自由式打水 10 碼（無浮板抬頭換氣）→ 深水撿物 → 側邊打水
UPDATE public.skills SET stage = 2, sort_order = 1 WHERE id = '9ac7c46d-2f0f-495b-a0cc-95a13e6684fc';
UPDATE public.skills SET stage = 2, sort_order = 2 WHERE id = '9194c9af-7e03-4d13-969b-4284d49b3a84';  -- 深水撿物
UPDATE public.skills SET stage = 2, sort_order = 3 WHERE id = '6d8d921a-e413-4bf9-81d6-a1930dab3404';

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L3 應該是 11 個技能（原本 11 個，停用 2 個、新增 2 個）：
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 3 and s.is_active
--  order by s.stage, s.sort_order;
