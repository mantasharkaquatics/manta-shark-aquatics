-- ============================================================
-- Manta Shark Aquatics — L4 仰式那一欄和流線／水下那一欄對調
--
-- 業主決定：把 仰式分解游／仰式 15 碼／仰式 25 碼 整欄，跟
-- 流線自由式打水／水下自由式打水／25 碼自由式衝刺 整欄互換。
--
-- 這樣 25 碼自由式衝刺 就緊鄰 自由式 25 碼，自由式 25 碼 的三個下游
-- （右二左二、單手轉肩游、25 碼自由式衝刺）變成一個乾淨的三叉，
-- 仰式那一欄則是右邊一條直線到底。
--
-- 改完從左到右：
--   階段1  （空）、自由式 15 碼、流線自由式打水、仰式分解游、蛙腿分解練習
--   階段2  （空）、自由式 25 碼、水下自由式打水、仰式 15 碼、蛙腿 10 碼
--   階段3  右二左二、單手轉肩游、25 碼自由式衝刺、仰式 25 碼、蝶式打水 25 碼
--
-- 只動 sort_order 和 col_override，前置沒改，不用再跑前置那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- 階段1
UPDATE public.skills SET sort_order = 1 WHERE id = 'dff814b2-90df-4043-aeb3-dd4e4df64fbe';  -- 自由式 15 碼
UPDATE public.skills SET sort_order = 2 WHERE id = '818b6b3b-63b9-4e13-9a52-f3f466f57cc7';  -- 流線自由式打水
UPDATE public.skills SET sort_order = 3 WHERE id = '96c47b53-df33-4b4a-9a8e-a84eed10c7b8';  -- 仰式分解游
UPDATE public.skills SET sort_order = 4 WHERE id = 'c820d2cd-86af-4412-a6bb-06f70a23ac22';  -- 蛙腿分解練習

-- 階段2
UPDATE public.skills SET sort_order = 1 WHERE id = '91e61121-5528-456b-9e7d-b97953ed0c39';  -- 自由式 25 碼
UPDATE public.skills SET sort_order = 2 WHERE id = '9722f505-b208-43dc-868d-495ba0f3c10e';  -- 水下自由式打水
UPDATE public.skills SET sort_order = 3 WHERE id = 'c1a0c2d4-5e6f-4a81-8b92-0c1d2e3f4a61';  -- 仰式 15 碼
UPDATE public.skills SET sort_order = 4 WHERE id = 'b02f51e3-1e69-487e-86b1-18e21ddb6812';  -- 蛙腿 10 碼

-- 階段3（sort_order 與 col_override 一起）
UPDATE public.skills SET sort_order = 1, col_override = -1 WHERE id = 'ecbcc8c6-dedd-4ebf-8e48-b6eb53e17aeb';  -- 右二左二
UPDATE public.skills SET sort_order = 2, col_override =  0 WHERE id = '6b94b35a-4890-4ffb-ad7e-f8b630415c8b';  -- 單手轉肩游
UPDATE public.skills SET sort_order = 3, col_override =  1 WHERE id = 'de640a60-96c1-4616-bcd2-f29f1aa61ed8';  -- 25 碼自由式衝刺
UPDATE public.skills SET sort_order = 4, col_override =  2 WHERE id = '6bf527f0-5e39-48bb-b975-6e29829b5d7c';  -- 仰式 25 碼
UPDATE public.skills SET sort_order = 5, col_override =  3 WHERE id = '327265d2-e212-4917-90d9-21daa2a5520e';  -- 蝶式打水 25 碼

COMMIT;
