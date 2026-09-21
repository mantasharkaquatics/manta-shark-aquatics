-- ============================================================
-- Manta Shark Aquatics — 停用 仰式 200 碼（L7）
--
-- 業主決定不要了。L7 剩 12 個技能：
--   階段1  自由式 50 碼（B 標）· 仰式 50 碼（B 標）· 蛙式 50 碼（B 標）· 蝶式 50 碼（B 標）· 蛙式水下划手
--   階段2  自由式 100 碼（B 標）· 仰式 100 碼（B 標）· 蛙式 100 碼（B 標）· 蝶式 100 碼（B 標）· 泳式轉換與轉身
--   階段3  自由式 500 碼 ·      ·      ·      · 個人混合式 100 碼
--
-- 仰式那一欄現在到 100 碼為止。對外的 /levels 第五條目標也跟著改
-- （原本寫「連續自由式 500 碼與仰式 200 碼」）。
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET is_active = false
WHERE id = '840dbdc7-1774-46ce-95ca-fe2f87d23475';   -- 仰式 200 碼

DELETE FROM public.skill_prerequisites
WHERE skill_id    = '840dbdc7-1774-46ce-95ca-fe2f87d23475'
   OR requires_id = '840dbdc7-1774-46ce-95ca-fe2f87d23475';

UPDATE public.skills SET stage = 3, sort_order = 2, col_override = 4
WHERE id = 'e9f7b834-3e50-446f-a775-33d547ba776b';   -- 個人混合式 100 碼（階段3 少一個，順序補上）

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L7 應該是 12 個技能，階段 1/2/3 各 5/5/2：
-- select s.stage, s.sort_order, s.col_override, s.name
--   from public.skills s join public.levels l on l.id = s.level_id
--  where l.level_number = 7 and s.is_active
--  order by s.stage, s.sort_order;
