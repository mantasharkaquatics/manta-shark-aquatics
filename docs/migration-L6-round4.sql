-- ============================================================
-- Manta Shark Aquatics — L6 水下海豚腿 上到階段1，自由式 200 碼 接在它底下
--
-- 業主決定：
--   水下海豚腿      階段3 → 階段1
--   自由式 200 碼   階段1 → 階段2，接在 水下海豚腿 底下並連線
--   個人混合式打水  階段2 → 階段3，不連線
--
-- 改完的 L6（11 個技能）：
--   階段1  水下海豚腿 · 蝶式 10 碼 · 仰式 100 碼 · 蛙式 15 碼
--   階段2  自由式 200 碼 · 蝶式 25 碼 · 仰式翻滾轉身 · 蛙式 25 碼
--   階段3  個人混合式打水 ·        ·          · 一手兩腳 · 一蛙腳一蝶腳
--
-- 兩個前置跟著改（在前置那份，先跑這份再跑那份）：
--   水下海豚腿     蝶式 25 碼（階段2）→ 蝶式打水 25 碼（L4）
--                  ——前置不能在自己後面的階段，它上到階段1 就不能再掛階段2 的東西
--   自由式 200 碼  加上 水下海豚腿（原本只掛 自由式 100 碼）
--                  ——這條說的是：轉身之後的水下那幾碼要先會，才去游含轉身的 200 碼
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET stage = 1, sort_order = 1, col_override = 0 WHERE id = '61765b4c-fd81-458d-acb9-1f4c19201994';  -- 水下海豚腿
UPDATE public.skills SET stage = 1, sort_order = 2, col_override = 1 WHERE id = '31dc4fc7-ef0b-4e4c-a80c-419ceebc7360';  -- 蝶式 10 碼
UPDATE public.skills SET stage = 1, sort_order = 3, col_override = 2 WHERE id = 'fe6b4f6e-cfa9-4cfe-979a-6cd3cf6d5af9';  -- 仰式 100 碼
UPDATE public.skills SET stage = 1, sort_order = 4, col_override = 3 WHERE id = '9f37e0f9-68d5-4bae-8349-c9d2d99d8225';  -- 蛙式 15 碼

UPDATE public.skills SET stage = 2, sort_order = 1, col_override = 0 WHERE id = '456f3041-33b2-4583-9f0a-4543ca2464c0';  -- 自由式 200 碼
UPDATE public.skills SET stage = 2, sort_order = 2, col_override = 1 WHERE id = 'eb420091-b357-41af-892a-73a1059ecfda';  -- 蝶式 25 碼
UPDATE public.skills SET stage = 2, sort_order = 3, col_override = 2 WHERE id = '3e66c970-61b6-4189-9fa8-353809086556';  -- 仰式翻滾轉身
UPDATE public.skills SET stage = 2, sort_order = 4, col_override = 3 WHERE id = '1b7d1a52-bac5-44a5-9bc4-18a7ab70903f';  -- 蛙式 25 碼

UPDATE public.skills SET stage = 3, sort_order = 1, col_override = 0 WHERE id = 'b7525cfb-5d9b-43b2-9868-393578adf991';  -- 個人混合式打水
UPDATE public.skills SET stage = 3, sort_order = 2, col_override = 3 WHERE id = 'f23977ee-2739-493a-b1f1-2547e29b5011';  -- 蛙式技術游（一手兩腳）
UPDATE public.skills SET stage = 3, sort_order = 3, col_override = 4 WHERE id = '01b6ee5e-44fc-40f5-a4ac-ebdc0cd6df36';  -- 蛙式技術游（一蛙腳一蝶腳）

COMMIT;
