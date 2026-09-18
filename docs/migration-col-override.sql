-- ============================================================
-- Manta Shark Aquatics — skills.col_override
--
-- 學習地圖上每個技能站哪一欄，本來完全由前置關係決定。那在多數情況是對的，
-- 但有一種情形它說不出業主要的意思：兩個技能掛在同一個前置底下時，它們一定
-- 會並排堆在那個前置的右邊，整排就往右擠。有時候那一排應該跨在前置的兩側。
--
-- col_override 就是給那種時候用的手動指定。可以是負數——那代表這一排要比
-- 上面幾排再往左一欄，整張圖會往右挪、板子多長一欄，而不是把方格畫到外面。
-- 絕大多數技能是 NULL，也就是照前置自動排。
--
-- 這一份順便把 L4 階段3 釘好：
--   自由式技術游（右二左二）  -1
--   自由式技術游（單手轉肩游） 0   → 挪完在 自由式 25 碼 正下方
--   仰式 25 碼                 1   → 挪完在 仰式 15 碼 正下方
--   蝶式打水 25 碼             3   → 挪完在 蛙腿 10 碼 正下方
--   水下自由式打水 底下因此是空白的。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.skills ADD COLUMN IF NOT EXISTS col_override smallint;

COMMENT ON COLUMN public.skills.col_override IS
  '學習地圖上手動指定的欄位；NULL 代表照前置關係自動排。可以是負數。';

UPDATE public.skills SET col_override = -1 WHERE id = 'ecbcc8c6-dedd-4ebf-8e48-b6eb53e17aeb';  -- 自由式技術游（右二左二）
UPDATE public.skills SET col_override =  0 WHERE id = '6b94b35a-4890-4ffb-ad7e-f8b630415c8b';  -- 自由式技術游（單手轉肩游）
UPDATE public.skills SET col_override =  1 WHERE id = '6bf527f0-5e39-48bb-b975-6e29829b5d7c';  -- 仰式 25 碼
UPDATE public.skills SET col_override =  3 WHERE id = '327265d2-e212-4917-90d9-21daa2a5520e';  -- 蝶式打水 25 碼

COMMIT;
