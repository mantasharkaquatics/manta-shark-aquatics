-- ============================================================
-- Manta Shark Aquatics — BBQ身體旋轉 改名並搬到 L3
--
--   改名   BBQ身體旋轉 → BBQ打水
--   搬家   L2 階段3 → L3 階段3，排在側轉換氣游 15 碼 左邊
--   前置   暫時全部斷開（業主要再想怎麼連）：它原本需要超人滑行和
--          自由式打水 10 碼，也原本是流線蹬牆和側轉換氣游的前置。
--          那兩個各自還有別的前置，所以沒有變成第一天就能做。
--
-- 前置的變動在 docs/migration-skill-prerequisites.sql，這份跑完要跑那份。
-- 可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET name = 'BBQ Kick' WHERE id = 'ed4c463b-6c65-497b-b370-18e9bd945468';   -- BBQ身體旋轉 → BBQ打水

UPDATE public.skills SET level_id = (SELECT id FROM public.levels WHERE level_number = 3)
WHERE id = 'ed4c463b-6c65-497b-b370-18e9bd945468';   -- BBQ打水 搬到 L3


-- L3 階段3
UPDATE public.skills SET stage = 3, sort_order = 1 WHERE id = 'ed4c463b-6c65-497b-b370-18e9bd945468';   -- BBQ打水
UPDATE public.skills SET stage = 3, sort_order = 2 WHERE id = '580a979a-e3f7-458f-b0f8-c39c7c20d686';   -- 側轉換氣游 15 碼
UPDATE public.skills SET stage = 3, sort_order = 3 WHERE id = '7a62a560-01cd-4199-b464-68a78a8ee98a';   -- 水中轉身
UPDATE public.skills SET stage = 3, sort_order = 4 WHERE id = '5aa1716e-8d05-41b0-a660-7fce60b69390';   -- 海豚腿 10 碼
UPDATE public.skills SET stage = 3, sort_order = 5 WHERE id = '997642b0-c290-48cf-a53f-ccb46d52d539';   -- 水域安全測驗

-- L2 階段3
UPDATE public.skills SET stage = 3, sort_order = 1 WHERE id = 'b1a0c2d4-5e6f-4a71-8b92-0c1d2e3f4a51';   -- 划手前進 5 碼
UPDATE public.skills SET stage = 3, sort_order = 2 WHERE id = 'ed0e69e4-3edb-4668-84d8-a39064fe2425';   -- 水中撿物
UPDATE public.skills SET stage = 3, sort_order = 3 WHERE id = 'c7022acb-3075-471f-8c45-4d5330139369';   -- 吐泡跳（過頭深）
UPDATE public.skills SET stage = 3, sort_order = 4 WHERE id = '63f1fc23-f60a-4417-86e1-2d4dd2d191c3';   -- 跳入胸深水

COMMIT;

-- ---------- 跑完的驗證 ----------
-- select l.level_number, s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number in (2,3) and s.is_active
--  order by l.level_number, s.stage, s.sort_order;
