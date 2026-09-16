-- ============================================================
-- Manta Shark Aquatics — Level 3 排列調整
--
-- 業主決定的搬動：
--   側邊打水     階段2 第3個 → 階段2 第2個（和深水撿物對調）
--   海豚腿 10 碼 階段3 第4個 → 階段2 第3個
--   深水撿物     階段2 第2個 → 階段3 第4個（和海豚腿對調）
--
-- 改完的樣子：
--   階段1  自由式打水 25 碼、仰式打水 25 碼、流線蹬牆
--   階段2  自由式打水 10 碼（無浮板抬頭換氣）、側邊打水、海豚腿 10 碼
--   階段3  BBQ打水、側轉換氣游 15 碼、水中轉身、深水撿物
--   獨立   水域安全測驗
--
-- 前置的改動在 docs/migration-skill-prerequisites.sql（先跑這份，再跑那份）：
--   側邊打水      改掛 自由式打水 25 碼（原本是 流線蹬牆）
--   側轉換氣游    改掛 側邊打水 + 划手前進 5 碼（原本是 自由式打水 25 碼 + 划手前進）
--   水中轉身      改掛 自由式打水 10 碼（無浮板）（原本是 自由式打水 25 碼）
-- 最後這個是為了讓線變簡單：水中轉身 原本要跨一排，得繞過中間那排才畫得過去。
-- 自由式打水 10 碼 本來就掛在 自由式打水 25 碼 底下，所以 水中轉身 還是一樣
-- 要等 25 碼 做到「自己做」，只是改成透過 10 碼 傳下去，門檻沒有變鬆。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET stage = 2, sort_order = 2
WHERE id = '6d8d921a-e413-4bf9-81d6-a1930dab3404';   -- 側邊打水

UPDATE public.skills SET stage = 2, sort_order = 3
WHERE id = '5aa1716e-8d05-41b0-a660-7fce60b69390';   -- 海豚腿 10 碼

UPDATE public.skills SET stage = 3, sort_order = 4
WHERE id = '9194c9af-7e03-4d13-969b-4284d49b3a84';   -- 深水撿物

COMMIT;

-- ----------- 跑完的驗證 -----------
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 3 and s.is_active
--  order by s.stage, s.sort_order;
