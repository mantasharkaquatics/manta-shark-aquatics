-- ============================================================
-- Manta Shark Aquatics — L2 階段2 的排序
--
-- 仰式打水 10 碼 排到這個階段的最後。圖上它就落在最右邊，第二排中間空
-- 出一格，蹬牆漂浮 → 划手前進 5 碼 那條線可以直直穿下去，不必再繞一
-- 圈橫過半個板子。
--
-- 只有同一階段裡的排序，沒有改名、沒有搬階段、沒有增刪。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET sort_order = 1 WHERE id = '4fd1fce7-9293-475e-a142-5a8d2ecf954d';   -- 自由式打水 10 碼（浮板）
UPDATE public.skills SET sort_order = 2 WHERE id = '268cc43e-0038-4fa9-9f28-18fff4aedcca';   -- 水母漂
UPDATE public.skills SET sort_order = 3 WHERE id = '35250d84-1461-4c39-85fc-7686d9576753';   -- 吐泡跳（胸深）
UPDATE public.skills SET sort_order = 4 WHERE id = '77dcafb5-fee7-4fde-8020-9691b99f5064';   -- 仰式打水 10 碼

COMMIT;

-- ---------- 跑完的驗證 ----------
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 2 and s.stage = 2 and s.is_active order by s.sort_order;
