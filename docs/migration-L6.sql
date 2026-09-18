-- ============================================================
-- Manta Shark Aquatics — Level 6 按泳姿排成四條直線
--
-- 業主決定：
--   停用  踩水 2 分鐘、著衣不戴蛙鏡游 25 碼
--   每一種泳姿排成自己的一欄
--
-- 改完的 L6（11 個技能），從左到右：
--   階段1  自由式 200 碼 · 蝶式 10 碼 · 仰式 100 碼 · 蛙式 15 碼 · 站姿跳水
--   階段2  　　　　　　 · 蝶式 25 碼 · 仰式翻滾轉身 · 蛙式 25 碼
--   階段3  　　　　　　 · 水下海豚腿 ·          · 雙手觸壁轉身 · 個人混合式打水
--
-- 為了讓每一欄是一條直線，三個前置改了（都在前置那份）：
--   水下海豚腿      蝶式打水 25 碼（L4）→ 蝶式 25 碼（同一欄的上一個）
--   雙手觸壁轉身    蛙式 15 碼 → 蛙式 25 碼（開放式轉身 保留）
--   仰式翻滾轉身    仰式 50 碼（L5）→ 仰式 100 碼（自由式翻滾轉身 保留）
--
-- ⚠ 著衣那條線現在只剩 L7 的 著衣不戴蛙鏡游 50 碼，它的前一步（25 碼）被停用了。
--   暫時把它掛在 自由式 200 碼 底下，排到 L7 的時候要決定是整條刪掉還是重建。
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 停用 ----------
UPDATE public.skills SET is_active = false
WHERE id IN ('3c01a30f-147d-4880-9738-75c245fc3325',   -- 踩水 2 分鐘
             'e9374f19-259b-4c49-85c2-a6faebae05e9');  -- 著衣不戴蛙鏡游 25 碼

DELETE FROM public.skill_prerequisites
WHERE requires_id IN ('3c01a30f-147d-4880-9738-75c245fc3325',
                      'e9374f19-259b-4c49-85c2-a6faebae05e9')
   OR skill_id    IN ('3c01a30f-147d-4880-9738-75c245fc3325',
                      'e9374f19-259b-4c49-85c2-a6faebae05e9');

-- ---------- 2. 階段、順序、欄位 ----------
UPDATE public.skills SET stage = 1, sort_order = 1, col_override = 0 WHERE id = '456f3041-33b2-4583-9f0a-4543ca2464c0';  -- 自由式 200 碼
UPDATE public.skills SET stage = 1, sort_order = 2, col_override = 1 WHERE id = '31dc4fc7-ef0b-4e4c-a80c-419ceebc7360';  -- 蝶式 10 碼
UPDATE public.skills SET stage = 1, sort_order = 3, col_override = 2 WHERE id = 'fe6b4f6e-cfa9-4cfe-979a-6cd3cf6d5af9';  -- 仰式 100 碼
UPDATE public.skills SET stage = 1, sort_order = 4, col_override = 3 WHERE id = '9f37e0f9-68d5-4bae-8349-c9d2d99d8225';  -- 蛙式 15 碼
UPDATE public.skills SET stage = 1, sort_order = 5, col_override = 4 WHERE id = 'b6a0c2d4-5e6f-4a76-8b92-0c1d2e3f4a56';  -- 站姿跳水

UPDATE public.skills SET stage = 2, sort_order = 1, col_override = 1 WHERE id = 'eb420091-b357-41af-892a-73a1059ecfda';  -- 蝶式 25 碼
UPDATE public.skills SET stage = 2, sort_order = 2, col_override = 2 WHERE id = '3e66c970-61b6-4189-9fa8-353809086556';  -- 仰式翻滾轉身
UPDATE public.skills SET stage = 2, sort_order = 3, col_override = 3 WHERE id = '1b7d1a52-bac5-44a5-9bc4-18a7ab70903f';  -- 蛙式 25 碼

UPDATE public.skills SET stage = 3, sort_order = 1, col_override = 1 WHERE id = '61765b4c-fd81-458d-acb9-1f4c19201994';  -- 水下海豚腿
UPDATE public.skills SET stage = 3, sort_order = 2, col_override = 3 WHERE id = 'c3a0c2d4-5e6f-4a83-8b92-0c1d2e3f4a63';  -- 雙手觸壁轉身
UPDATE public.skills SET stage = 3, sort_order = 3, col_override = 4 WHERE id = 'b7525cfb-5d9b-43b2-9868-393578adf991';  -- 個人混合式打水

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L6 應該是 11 個技能：
-- select s.stage, s.sort_order, s.col_override, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 6 and s.is_active
--  order by s.stage, s.sort_order;
