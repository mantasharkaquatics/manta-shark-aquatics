-- ============================================================
-- Manta Shark Aquatics — Level 2 課程改版
--
-- 搬家（沒有改名、沒有刪除）：
--   階段1 → 階段2   自由式打水 10 碼（浮板）、仰式打水 10 碼
--   階段2 → 階段1   憋氣 5 秒
--   階段2 → 階段3   BBQ身體旋轉
--   階段3 → 階段1   大字漂 10 秒
--   階段3 留著       吐泡跳（過頭深）、水中撿物、划手前進 5 碼
--
-- 新增：水母漂（階段2）。前置是憋氣 5 秒；水中撿物多一條前置指向它，
--       所以地圖上會有一條線從水母漂連到水中撿物。
--
-- 搬完之後：
--   階段1  蹬牆漂浮、憋氣 5 秒、大字漂 10 秒
--   階段2  自由式打水 10 碼（浮板）、仰式打水 10 碼、吐泡跳（胸深）、水母漂
--   階段3  BBQ身體旋轉、吐泡跳（過頭深）、水中撿物、划手前進 5 碼
--
-- 前置關係有變（多了兩條），所以這份跑完要再跑
-- docs/migration-skill-prerequisites.sql。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 新增水母漂 ----------
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT '268cc43e-0038-4fa9-9f28-18fff4aedcca', l.id, 'Jellyfish Float', 2, 4, true,
       'Face in, arms and legs hanging loose, floats for ten seconds and stands up unaided. 臉入水、手腳自然垂下漂 10 秒，自己抬頭站起來。'
  FROM public.levels l WHERE l.level_number = 2
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

-- ---------- 階段與順序 ----------

-- 階段1
UPDATE public.skills SET stage = 1, sort_order = 1 WHERE id = 'b46c9773-7e09-4da4-8beb-d79050075710';   -- 蹬牆漂浮
UPDATE public.skills SET stage = 1, sort_order = 2 WHERE id = '084fe3dd-cbe3-485c-82d6-dcdd2cd56ae7';   -- 憋氣 5 秒
UPDATE public.skills SET stage = 1, sort_order = 3 WHERE id = '1b90e0d5-e21d-4991-9d97-a16394d3913b';   -- 大字漂 10 秒

-- 階段2
UPDATE public.skills SET stage = 2, sort_order = 1 WHERE id = '4fd1fce7-9293-475e-a142-5a8d2ecf954d';   -- 自由式打水 10 碼（浮板）
UPDATE public.skills SET stage = 2, sort_order = 2 WHERE id = '77dcafb5-fee7-4fde-8020-9691b99f5064';   -- 仰式打水 10 碼
UPDATE public.skills SET stage = 2, sort_order = 3 WHERE id = '35250d84-1461-4c39-85fc-7686d9576753';   -- 吐泡跳（胸深）
UPDATE public.skills SET stage = 2, sort_order = 4 WHERE id = '268cc43e-0038-4fa9-9f28-18fff4aedcca';   -- 水母漂

-- 階段3
UPDATE public.skills SET stage = 3, sort_order = 1 WHERE id = 'ed4c463b-6c65-497b-b370-18e9bd945468';   -- BBQ身體旋轉
UPDATE public.skills SET stage = 3, sort_order = 2 WHERE id = 'c7022acb-3075-471f-8c45-4d5330139369';   -- 吐泡跳（過頭深）
UPDATE public.skills SET stage = 3, sort_order = 3 WHERE id = 'ed0e69e4-3edb-4668-84d8-a39064fe2425';   -- 水中撿物
UPDATE public.skills SET stage = 3, sort_order = 4 WHERE id = 'b1a0c2d4-5e6f-4a71-8b92-0c1d2e3f4a51';   -- 划手前進 5 碼

COMMIT;

-- ---------- 跑完的驗證 ----------
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 2 and s.is_active order by s.stage, s.sort_order;
