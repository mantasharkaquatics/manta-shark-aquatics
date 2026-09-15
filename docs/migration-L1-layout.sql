-- ============================================================
-- Manta Shark Aquatics — L1 排版整理
--
-- 業主看過兩種排法之後選的：面部入水從階段1 搬到階段2。下水以後的事
-- 跟水中行走、水面嘴巴吐泡泡同一批，而且這樣 L1 的每一條線都只是
-- 「上一排接下一排」，沒有任何一條要繞到板子側邊。
--
-- 順序也一起定下來（見下）。
--
-- 前置的三個改動在 docs/migration-skill-prerequisites.sql：
--   水中行走      不再掛在辨識泳池環境上 —— 辨識泳池環境是獨立項目，
--                 圖上不連任何東西。
--   面部入水漂浮  不再掛在沿壁移動上 —— 沿著池壁換手走跟臉入水俯漂
--                 沒有因果。
--   坐姿與跪姿入水（L4）原本唯一的前置是辨識泳池環境，改接跳入胸深水。
-- 所以這份跑完要再跑那一份。
--
-- 可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';


-- 階段1
UPDATE public.skills SET stage = 1, sort_order = 1 WHERE id = '3aa56665-8ce2-4524-819d-efcf30057a02';   -- 辨識泳池環境
UPDATE public.skills SET stage = 1, sort_order = 2 WHERE id = 'f0b828a0-63a5-4aea-8000-13e1b05b1682';   -- 安全進出泳池
UPDATE public.skills SET stage = 1, sort_order = 3 WHERE id = 'a5ec094e-4338-4259-9e43-4b913cd02ca3';   -- 沿壁移動
UPDATE public.skills SET stage = 1, sort_order = 4 WHERE id = '2eb2c769-054f-4e44-9769-779c7972318b';   -- 岸上打水

-- 階段2
UPDATE public.skills SET stage = 2, sort_order = 1 WHERE id = '58842492-eacd-4c4d-9506-a18e562c64b5';   -- 水中行走
UPDATE public.skills SET stage = 2, sort_order = 2 WHERE id = '0d151d1b-8492-49bc-824e-c4e26a657046';   -- 水面嘴巴吐泡泡
UPDATE public.skills SET stage = 2, sort_order = 3 WHERE id = '84716c30-a569-4905-9970-855a998068e1';   -- 輔助仰面漂浮
UPDATE public.skills SET stage = 2, sort_order = 4 WHERE id = '49f02c5d-009c-459c-8ef0-de2dad48c25d';   -- 面部入水

-- 階段3
UPDATE public.skills SET stage = 3, sort_order = 1 WHERE id = '92751613-6a3c-465f-bcdb-251754df1dff';   -- 面部入水漂浮
UPDATE public.skills SET stage = 3, sort_order = 2 WHERE id = 'cdf91a82-3f78-4c32-9f11-7f73b5d3754a';   -- 水中鼻子吐泡泡
UPDATE public.skills SET stage = 3, sort_order = 3 WHERE id = 'd6915327-5d9d-4907-be40-b59ad3536c8d';   -- 超人滑行

COMMIT;

-- ---------- 跑完的驗證 ----------
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 1 and s.is_active order by s.stage, s.sort_order;
