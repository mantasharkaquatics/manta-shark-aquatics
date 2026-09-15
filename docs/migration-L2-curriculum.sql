-- ============================================================
-- Manta Shark Aquatics — Level 2 課程改版（只動階段與順序）
--
-- 業主逐項決定：沒有改名、沒有新增、沒有刪除，全部是搬家。
--   階段1 → 階段2   自由式打水 10 碼（浮板）、仰式打水 10 碼
--   階段2 → 階段1   憋氣 5 秒
--   階段2 → 階段3   BBQ身體旋轉
--   階段3 → 階段2   大字漂 10 秒
--   （吐泡跳（過頭深）留在階段3）
--
-- 搬完之後：
--   階段1  蹬牆漂浮、憋氣 5 秒
--   階段2  自由式打水 10 碼（浮板）、仰式打水 10 碼、吐泡跳（胸深）、大字漂 10 秒
--   階段3  BBQ身體旋轉、吐泡跳（過頭深）、水中撿物、划手前進 5 碼
--
-- 前置關係一條都沒有變，也不需要變：搬完之後每一個前置都還在它所牽動
-- 的技能的同一階段或更前面（scripts/prereq-check.mjs 擋這件事，已經跑
-- 過）。所以不用重跑 migration-skill-prerequisites.sql。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';


-- 階段1
UPDATE public.skills SET stage = 1, sort_order = 1 WHERE id = 'b46c9773-7e09-4da4-8beb-d79050075710';   -- 蹬牆漂浮
UPDATE public.skills SET stage = 1, sort_order = 2 WHERE id = '084fe3dd-cbe3-485c-82d6-dcdd2cd56ae7';   -- 憋氣 5 秒

-- 階段2
UPDATE public.skills SET stage = 2, sort_order = 1 WHERE id = '4fd1fce7-9293-475e-a142-5a8d2ecf954d';   -- 自由式打水 10 碼（浮板）
UPDATE public.skills SET stage = 2, sort_order = 2 WHERE id = '77dcafb5-fee7-4fde-8020-9691b99f5064';   -- 仰式打水 10 碼
UPDATE public.skills SET stage = 2, sort_order = 3 WHERE id = '35250d84-1461-4c39-85fc-7686d9576753';   -- 吐泡跳（胸深）
UPDATE public.skills SET stage = 2, sort_order = 4 WHERE id = '1b90e0d5-e21d-4991-9d97-a16394d3913b';   -- 大字漂 10 秒

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
