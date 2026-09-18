-- ============================================================
-- Manta Shark Aquatics — L5 蝶式那一欄移到自由式和仰式中間
--
-- 從左到右變成：自由式 · 蝶式 · 仰式 · （空）· 蛙式
--   階段1  自由式 50 碼 · 自手蝶腳 · 仰式 50 碼 ·        · 蛙腿 25 碼
--   階段2  自由式 100 碼 · 單手蝶式 · 仰式蝶腳 ·        · 蛙式 10 碼
--   階段3  自由式翻滾轉身 · 單手仰式 · 雙手仰式 · 側身六踢轉換 · 開放式轉身
--
-- 中間那個空格是仰式在階段3 展開成三叉用的，不是漏掉。
-- 只動 sort_order 和 col_override，前置沒改，不用再跑前置那份。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET stage = 1, sort_order = 1, col_override = 0 WHERE id = 'be760433-09d7-4cac-9863-fa758abc9009';  -- 自由式 50 碼
UPDATE public.skills SET stage = 1, sort_order = 2, col_override = 1 WHERE id = '8aadc967-9b3f-430b-b161-273001ffa21a';  -- 自手蝶腳
UPDATE public.skills SET stage = 1, sort_order = 3, col_override = 2 WHERE id = '97804fbb-13d4-4367-ab9d-0276b25591d6';  -- 仰式 50 碼
UPDATE public.skills SET stage = 1, sort_order = 4, col_override = 4 WHERE id = 'e858562b-a3aa-4875-84ef-e1f6875770e5';  -- 蛙腿 25 碼

UPDATE public.skills SET stage = 2, sort_order = 1, col_override = 0 WHERE id = '18a6462c-4c67-4e93-8838-8bc03717b463';  -- 自由式 100 碼
UPDATE public.skills SET stage = 2, sort_order = 2, col_override = 1 WHERE id = '6d6b06d9-7b44-4980-a1a6-a4ab887d5ede';  -- 單手蝶式
UPDATE public.skills SET stage = 2, sort_order = 3, col_override = 2 WHERE id = '2cd9fcb7-cb6d-4853-95c0-97f3acc443d7';  -- 仰式蝶腳
UPDATE public.skills SET stage = 2, sort_order = 4, col_override = 4 WHERE id = 'ee7b11f4-bb68-4868-95c9-62270c9ae576';  -- 蛙式 10 碼

UPDATE public.skills SET stage = 3, sort_order = 1, col_override = 0 WHERE id = '22e00423-edc5-4626-8e7f-8bc4e846203f';  -- 自由式翻滾轉身
UPDATE public.skills SET stage = 3, sort_order = 2, col_override = 1 WHERE id = '4093e9eb-c077-4efa-9dc7-2a8378163b2b';  -- 單手仰式
UPDATE public.skills SET stage = 3, sort_order = 3, col_override = 2 WHERE id = '59628c84-eead-4393-9e2e-5774670383ca';  -- 雙手仰式
UPDATE public.skills SET stage = 3, sort_order = 4, col_override = 3 WHERE id = 'd6b2ba7b-5a81-4247-8532-d9eb078f71bd';  -- 側身六踢轉換
UPDATE public.skills SET stage = 3, sort_order = 5, col_override = 4 WHERE id = '0ff7355f-2cef-42b9-afa2-0749603d6c33';  -- 開放式轉身

COMMIT;
