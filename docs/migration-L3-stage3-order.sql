-- ============================================================
-- Manta Shark Aquatics — Level 3 階段 3 排序
--
-- 業主要 BBQ打水 和 側轉換氣游 15 碼 對調，線要好看。
--
-- 階段 3 從左到右改成：
--   水中轉身、側轉換氣游 15 碼、BBQ打水、深水撿物
--
-- 圖上的欄位是跟著前置走的，不是跟著 sort_order 走：一個技能會站在它前置
-- 的那一欄底下。側轉換氣游 掛 側邊打水（第 2 欄）、水中轉身 掛 自由式打水
-- 10 碼（第 1 欄），所以這兩個的位置是被前置釘住的。真的「原地對調」會讓
-- 這兩條線交叉。改成這個順序之後，BBQ打水 就在 側轉換氣游 的右邊，
-- 而且五條線裡有四條是直的，剩下那條只轉一次。
--
-- 只動 sort_order，前置沒有改，所以不用再跑前置那份。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET stage = 3, sort_order = 1
WHERE id = '7a62a560-01cd-4199-b464-68a78a8ee98a';   -- 水中轉身

UPDATE public.skills SET stage = 3, sort_order = 2
WHERE id = '580a979a-e3f7-458f-b0f8-c39c7c20d686';   -- 側轉換氣游 15 碼

UPDATE public.skills SET stage = 3, sort_order = 3
WHERE id = 'ed4c463b-6c65-497b-b370-18e9bd945468';   -- BBQ打水

UPDATE public.skills SET stage = 3, sort_order = 4
WHERE id = '9194c9af-7e03-4d13-969b-4284d49b3a84';   -- 深水撿物

COMMIT;

-- ----------- 跑完的驗證 -----------
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 3 and s.is_active
--  order by s.stage, s.sort_order;
