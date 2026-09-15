-- ============================================================
-- Manta Shark Aquatics — Level 1 課程改版
--
-- 業主逐項決定的結果：
--   改名   安全入水與辨識 → 辨識泳池環境
--          水中吐泡泡     → 水面吐泡泡（標準也從「臉入水」改成「貼著水面吹」，
--                           臉入水吐氣那件事由階段3 的水中鼻子吐泡泡負責）
--          安全出水       → 安全進出泳池
--          輔助漂浮       → 面部入水漂浮（標準也從「仰漂」改成「俯漂」，
--                           仰漂那件事改由新的「輔助仰面漂浮」負責）
--   搬家   岸上打水 從 階段2 搬到 階段1
--   新增   面部入水（階段1）、輔助仰面漂浮（階段2）、水中鼻子吐泡泡（階段3）
--   停用   漂浮站立轉換
--
-- 「停用」不是刪除：資料列留著，is_active = false。已經打過這個技能的
-- 學生成績因此不會消失，學習地圖和教練端則不再顯示它。要真的刪除，
-- 得先決定那些成績怎麼辦，不在這份裡面。
--
-- 前置關係不在這份，在 docs/migration-skill-prerequisites.sql
-- （那份是從 docs/skill-prerequisites.json 產生的，先跑這份再跑那份）。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 改名與改標準 ----------
UPDATE public.skills SET
  name = 'Pool Safety Awareness',
  pass_criteria = 'Waits for the coach at the edge, and can point out the deep end and where not to run. 走到池邊會等教練，說得出哪裡是深水、哪裡不能跑。'
WHERE id = '3aa56665-8ce2-4524-819d-efcf30057a02';

UPDATE public.skills SET
  name = 'Safe Entry and Exit',
  pass_criteria = 'Enters feet-first on the coach''s word, and climbs out unaided by the ladder or the wall. 聽指令雙腳先入水；自己用扶梯或撐池邊上岸，不用人扶。'
WHERE id = 'f0b828a0-63a5-4aea-8000-13e1b05b1682';

UPDATE public.skills SET
  name = 'Assisted Front Float',
  pass_criteria = 'Front float for five seconds with one hand of support, arms and legs relaxed and straight. 臉入水俯漂 5 秒，教練單手托著，手腳放鬆伸直。'
WHERE id = '92751613-6a3c-465f-bcdb-251754df1dff';

UPDATE public.skills SET
  name = 'Surface Bubbles',
  pass_criteria = 'Blows bubbles with the mouth on the surface for five seconds, bubbles visible and no water swallowed. 嘴巴貼著水面吹泡泡 5 秒，吹得出泡泡、不喝到水。'
WHERE id = '0d151d1b-8492-49bc-824e-c4e26a657046';   -- 水中吐泡泡 → 水面吐泡泡

-- ---------- 2. 停用 ----------
UPDATE public.skills SET is_active = false
WHERE id = '52ad780b-a73d-418d-988f-f49651cbc088';   -- 漂浮站立轉換

-- ---------- 3. 新增三個技能 ----------
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT '49f02c5d-009c-459c-8ef0-de2dad48c25d', l.id, 'Face in Water', 1, 4, true,
       'Puts the whole face in the water for three seconds and comes up unaided, without wiping the face. 臉整個入水 3 秒，自己抬頭起來，不抹臉也不慌。'
  FROM public.levels l WHERE l.level_number = 1
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT '84716c30-a569-4905-9970-855a998068e1', l.id, 'Assisted Back Float', 2, 3, true,
       'Back float for five seconds with one hand under the back, ears in the water and hips at the surface. 教練單手托背，仰面漂 5 秒，耳朵入水、肚子朝上。'
  FROM public.levels l WHERE l.level_number = 1
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT 'cdf91a82-3f78-4c32-9f11-7f73b5d3754a', l.id, 'Nose Bubbles', 3, 2, true,
       'Blows bubbles through the nose for five seconds with the face in, without lifting the head. 臉入水用鼻子吐泡泡 5 秒，中途不抬頭、不嗆到。'
  FROM public.levels l WHERE l.level_number = 1
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

-- ---------- 4. 階段與順序 ----------
-- 階段1：辨識泳池環境、安全進出泳池、抓握池壁、面部入水、岸上打水
UPDATE public.skills SET stage = 1, sort_order = 1 WHERE id = '3aa56665-8ce2-4524-819d-efcf30057a02';
UPDATE public.skills SET stage = 1, sort_order = 2 WHERE id = 'f0b828a0-63a5-4aea-8000-13e1b05b1682';
UPDATE public.skills SET stage = 1, sort_order = 3 WHERE id = 'a5ec094e-4338-4259-9e43-4b913cd02ca3';
UPDATE public.skills SET stage = 1, sort_order = 4 WHERE id = '49f02c5d-009c-459c-8ef0-de2dad48c25d';
UPDATE public.skills SET stage = 1, sort_order = 5 WHERE id = '2eb2c769-054f-4e44-9769-779c7972318b';
-- 階段2：水中行走、水中吐泡泡、輔助仰面漂浮
UPDATE public.skills SET stage = 2, sort_order = 1 WHERE id = '58842492-eacd-4c4d-9506-a18e562c64b5';
UPDATE public.skills SET stage = 2, sort_order = 2 WHERE id = '0d151d1b-8492-49bc-824e-c4e26a657046';
UPDATE public.skills SET stage = 2, sort_order = 3 WHERE id = '84716c30-a569-4905-9970-855a998068e1';
-- 階段3：面部入水漂浮、水中鼻子吐泡泡、超人滑行
UPDATE public.skills SET stage = 3, sort_order = 1 WHERE id = '92751613-6a3c-465f-bcdb-251754df1dff';
UPDATE public.skills SET stage = 3, sort_order = 2 WHERE id = 'cdf91a82-3f78-4c32-9f11-7f73b5d3754a';
UPDATE public.skills SET stage = 3, sort_order = 3 WHERE id = 'd6915327-5d9d-4907-be40-b59ad3536c8d';

COMMIT;

-- ---------- 跑完的驗證 ----------
-- select s.stage, s.sort_order, s.name, s.is_active
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 1 order by s.stage, s.sort_order;
--
-- 停用的那個還有沒有學生成績掛著：
-- select count(*) from student_skill_progress
--  where skill_id = '52ad780b-a73d-418d-988f-f49651cbc088';
