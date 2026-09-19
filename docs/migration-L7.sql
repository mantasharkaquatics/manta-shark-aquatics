-- ============================================================
-- Manta Shark Aquatics — Level 7 按泳姿排好，衝刺改名
--
-- 業主決定：
--   停用  著衣不戴蛙鏡游 50 碼、出發台起跳與仰式出發
--   L7 自由式 25 碼衝刺 → 自由式衝刺 50 碼（距離也從 25 改成 50，標準重寫）
--   L4 25 碼自由式衝刺   → 自由式衝刺 25 碼
--   兩個現在只差距離，中文和英文都對得上，不會再混淆。
--
-- 改完的 L7（14 個技能），從左到右六欄：
--   自由式距離 · 自由式速度 · 蝶式 · 仰式 · 蛙式 · 混合式
--   階段1  自由式 400 碼 · 自由式 50 碼計時 ·      ·      · 蛙式水下划手
--   階段2  自由式 500 碼 · 自由式衝刺 50 碼 · 蝶式 50 碼 · 仰式 200 碼 · 蛙式 50 碼 · 泳式轉換與轉身
--   階段3  自由式（合規） ·          · 蝶式（合規）· 仰式（合規）· 蛙式（合規）· 個人混合式 100 碼
--
-- 為了讓每一欄接成一條，三個前置改了（都在前置那份）：
--   自由式（合規）  自由式 50 碼計時 → 自由式 500 碼
--   蛙式 50 碼      蛙式 25 碼 → 蛙式 25 碼 + 蛙式水下划手
--                   （合規的蛙式 50 碼，轉身之後那一下水下划手是一定要會的）
--   蛙式（合規）    蛙式 50 碼 + 蛙式水下划手 → 只掛 蛙式 50 碼（水下划手變成傳下去的）
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 停用 ----------
UPDATE public.skills SET is_active = false
WHERE id IN ('91adaea7-aefa-432c-8b9a-44ca43976bdb',   -- 著衣不戴蛙鏡游 50 碼
             'b7a0c2d4-5e6f-4a77-8b92-0c1d2e3f4a57');  -- 出發台起跳與仰式出發

DELETE FROM public.skill_prerequisites
WHERE requires_id IN ('91adaea7-aefa-432c-8b9a-44ca43976bdb',
                      'b7a0c2d4-5e6f-4a77-8b92-0c1d2e3f4a57')
   OR skill_id    IN ('91adaea7-aefa-432c-8b9a-44ca43976bdb',
                      'b7a0c2d4-5e6f-4a77-8b92-0c1d2e3f4a57');

-- ---------- 2. 衝刺改名 ----------
UPDATE public.skills SET
  name = 'Freestyle Sprint 50 yd',
  pass_criteria = 'All-out 50 yd freestyle, the stroke still there on the second length, with no breath in the last 5 yd. 自由式 50 碼全力衝刺，第二趟動作不垮，最後 5 碼不換氣。'
WHERE id = '0280911e-9a79-4eed-8916-883e64dee3de';   -- L7 自由式 25 碼衝刺 → 自由式衝刺 50 碼

UPDATE public.skills SET name = 'Freestyle Sprint 25 yd'
WHERE id = 'de640a60-96c1-4616-bcd2-f29f1aa61ed8';   -- L4 25 碼自由式衝刺 → 自由式衝刺 25 碼

-- ---------- 3. 階段、順序、欄位 ----------
UPDATE public.skills SET stage = 1, sort_order = 1, col_override = 0 WHERE id = 'eaa47012-b0e4-4e77-ba05-f87b6acc80db';  -- 自由式 400 碼
UPDATE public.skills SET stage = 1, sort_order = 2, col_override = 1 WHERE id = 'c4b854b3-f337-4799-9631-33c6459951c6';  -- 自由式 50 碼計時
UPDATE public.skills SET stage = 1, sort_order = 3, col_override = 4 WHERE id = 'fb34523b-58c7-4e1f-9cef-a56ebea37757';  -- 蛙式水下划手

UPDATE public.skills SET stage = 2, sort_order = 1, col_override = 0 WHERE id = 'a8d00e21-01af-4ad5-a90d-a7e8bd59e6a8';  -- 自由式 500 碼
UPDATE public.skills SET stage = 2, sort_order = 2, col_override = 1 WHERE id = '0280911e-9a79-4eed-8916-883e64dee3de';  -- 自由式衝刺 50 碼
UPDATE public.skills SET stage = 2, sort_order = 3, col_override = 2 WHERE id = 'c9047d9f-1b91-4902-a4ce-33e303b4674b';  -- 蝶式 50 碼
UPDATE public.skills SET stage = 2, sort_order = 4, col_override = 3 WHERE id = '840dbdc7-1774-46ce-95ca-fe2f87d23475';  -- 仰式 200 碼
UPDATE public.skills SET stage = 2, sort_order = 5, col_override = 4 WHERE id = 'de916eb5-53b3-4ab3-b451-53f793a1666f';  -- 蛙式 50 碼
UPDATE public.skills SET stage = 2, sort_order = 6, col_override = 5 WHERE id = '58b20bb7-23a5-4ee2-affb-5f16284a7563';  -- 泳式轉換與轉身

UPDATE public.skills SET stage = 3, sort_order = 1, col_override = 0 WHERE id = '6d6b6afb-ed92-47b1-b557-52904c7931ab';  -- 自由式（合規）
UPDATE public.skills SET stage = 3, sort_order = 2, col_override = 2 WHERE id = 'b617a73c-8da4-4526-9420-58ed4c682a94';  -- 蝶式（合規）
UPDATE public.skills SET stage = 3, sort_order = 3, col_override = 3 WHERE id = '11f3d107-8ea1-43f9-9301-3875cd71dad0';  -- 仰式（合規）
UPDATE public.skills SET stage = 3, sort_order = 4, col_override = 4 WHERE id = '1ed417e9-431d-46db-837b-adabbdde74f3';  -- 蛙式（合規）
UPDATE public.skills SET stage = 3, sort_order = 5, col_override = 5 WHERE id = 'e9f7b834-3e50-446f-a775-33d547ba776b';  -- 個人混合式 100 碼

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L7 應該是 14 個技能：
-- select s.stage, s.sort_order, s.col_override, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 7 and s.is_active
--  order by s.stage, s.sort_order;
