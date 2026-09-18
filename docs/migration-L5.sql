-- ============================================================
-- Manta Shark Aquatics — Level 5 改版
--
-- 業主決定：
--   停用  岸上伸援與拋繩救援、水面下潛
--   自由式 50 碼 → 階段1、自由式 100 碼 → 階段2、自由式翻滾轉身 → 階段3，
--         三個接成一條直線（翻滾轉身 改掛 自由式 100 碼）
--   蛙腿 25 碼 → 階段1，開放式轉身 → 階段2 並掛在 蛙腿 25 碼 底下
--   仰式 50 碼 → 階段1
--
-- 改完的 L5（7 個技能）：
--   階段1  自由式 50 碼、仰式 50 碼、蛙腿 25 碼
--   階段2  自由式 100 碼、開放式轉身
--   階段3  自由式翻滾轉身、憋氣 15 秒
-- 三條線全是直的。
--
-- 前置的改動（在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份）：
--   L5 開放式轉身      原本 自由式 25 碼 + 水中轉身 → 改掛 蛙腿 25 碼
--   L5 自由式翻滾轉身  原本 開放式轉身 + 自由式 50 碼 → 改掛 自由式 100 碼
--   L6 水下海豚腿      少了 水面下潛 → 只剩 蝶式打水 25 碼
--   L7 蛙式水下划手    少了 水面下潛 → 只剩 蛙式 25 碼
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 停用 ----------
UPDATE public.skills SET is_active = false
WHERE id IN ('b5a0c2d4-5e6f-4a75-8b92-0c1d2e3f4a55',   -- 岸上伸援與拋繩救援
             'b4a0c2d4-5e6f-4a74-8b92-0c1d2e3f4a54');  -- 水面下潛

DELETE FROM public.skill_prerequisites
WHERE requires_id IN ('b5a0c2d4-5e6f-4a75-8b92-0c1d2e3f4a55',
                      'b4a0c2d4-5e6f-4a74-8b92-0c1d2e3f4a54')
   OR skill_id    IN ('b5a0c2d4-5e6f-4a75-8b92-0c1d2e3f4a55',
                      'b4a0c2d4-5e6f-4a74-8b92-0c1d2e3f4a54');

-- ---------- 2. 階段與順序 ----------
UPDATE public.skills SET stage = 1, sort_order = 1 WHERE id = 'be760433-09d7-4cac-9863-fa758abc9009';  -- 自由式 50 碼
UPDATE public.skills SET stage = 1, sort_order = 2 WHERE id = '97804fbb-13d4-4367-ab9d-0276b25591d6';  -- 仰式 50 碼
UPDATE public.skills SET stage = 1, sort_order = 3 WHERE id = 'e858562b-a3aa-4875-84ef-e1f6875770e5';  -- 蛙腿 25 碼

UPDATE public.skills SET stage = 2, sort_order = 1 WHERE id = '18a6462c-4c67-4e93-8838-8bc03717b463';  -- 自由式 100 碼
UPDATE public.skills SET stage = 2, sort_order = 2 WHERE id = '0ff7355f-2cef-42b9-afa2-0749603d6c33';  -- 開放式轉身

UPDATE public.skills SET stage = 3, sort_order = 1 WHERE id = '22e00423-edc5-4626-8e7f-8bc4e846203f';  -- 自由式翻滾轉身
UPDATE public.skills SET stage = 3, sort_order = 2 WHERE id = '0b50339e-3764-40f3-8d12-fa53502831ec';  -- 憋氣 15 秒

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L5 應該是 7 個技能：
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 5 and s.is_active
--  order by s.stage, s.sort_order;
