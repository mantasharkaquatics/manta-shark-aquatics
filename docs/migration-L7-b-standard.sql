-- ============================================================
-- Manta Shark Aquatics — Level 7 重建：四式 50／100 碼，B 標過關
--
-- 依據：USA Swimming 2025–2028 單齡動機標準（Single-Age Motivational
-- Standards），10 歲組、短水道碼（SCY）、B 欄。女生／男生分開。
--   50 自由 39.89 / 38.29      100 自由 1:30.89 / 1:28.49
--   50 仰   48.59 / 48.49      100 仰   1:45.79 / 1:41.09
--   50 蛙   54.59 / 53.49      100 蛙   2:00.29 / 1:55.49
--   50 蝶   48.39 / 46.49      100 蝶   1:56.69 / 1:53.89
--
-- 改完的 L7（13 個技能），五欄：自由式 · 仰式 · 蛙式 · 蝶式 · 混合式
--   階段1  自由式 50 碼（B 標）· 仰式 50 碼（B 標）· 蛙式 50 碼（B 標）· 蝶式 50 碼（B 標）
--   階段2  自由式 100 碼（B 標）· 仰式 100 碼（B 標）· 蛙式 100 碼（B 標）· 蝶式 100 碼（B 標）· 泳式轉換與轉身
--   階段3  自由式 500 碼 · 仰式 200 碼 · 蛙式水下划手 ·      · 個人混合式 100 碼
--
-- 中文名字為什麼要加「（B 標）」：L5 已經有 自由式 50 碼、仰式 50 碼，
-- L6 已經有 仰式 100 碼。中文名字是 docs 那兩份 JSON 的對照鍵，撞名會
-- 把資料對錯，所以 L7 這一批一定要跟前面分得開。
--
-- 停用五個（合規四式併進 50 碼的標準裡，衝刺併進 自由式 50 碼（B 標）），
-- 加上 自由式 400 碼：
--   自由式 400 碼、自由式衝刺 50 碼
--   自由式（合規）、仰式（合規）、蛙式（合規）、蝶式（合規）
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 停用 ----------
UPDATE public.skills SET is_active = false
WHERE id IN ('eaa47012-b0e4-4e77-ba05-f87b6acc80db',   -- 自由式 400 碼
             '0280911e-9a79-4eed-8916-883e64dee3de',   -- 自由式衝刺 50 碼
             '6d6b6afb-ed92-47b1-b557-52904c7931ab',   -- 自由式（合規）
             '11f3d107-8ea1-43f9-9301-3875cd71dad0',   -- 仰式（合規）
             '1ed417e9-431d-46db-837b-adabbdde74f3',   -- 蛙式（合規）
             'b617a73c-8da4-4526-9420-58ed4c682a94');  -- 蝶式（合規）

DELETE FROM public.skill_prerequisites
WHERE requires_id IN ('eaa47012-b0e4-4e77-ba05-f87b6acc80db','0280911e-9a79-4eed-8916-883e64dee3de',
                      '6d6b6afb-ed92-47b1-b557-52904c7931ab','11f3d107-8ea1-43f9-9301-3875cd71dad0',
                      '1ed417e9-431d-46db-837b-adabbdde74f3','b617a73c-8da4-4526-9420-58ed4c682a94')
   OR skill_id    IN ('eaa47012-b0e4-4e77-ba05-f87b6acc80db','0280911e-9a79-4eed-8916-883e64dee3de',
                      '6d6b6afb-ed92-47b1-b557-52904c7931ab','11f3d107-8ea1-43f9-9301-3875cd71dad0',
                      '1ed417e9-431d-46db-837b-adabbdde74f3','b617a73c-8da4-4526-9420-58ed4c682a94');

-- ---------- 2. 三個改名並重寫標準 ----------
UPDATE public.skills SET
  name = 'Freestyle 50 yd (B Standard)',
  pass_criteria = 'Swims a legal 50 yd freestyle at or under the age-10 B standard: 39.89 girls, 38.29 boys. 自由式 50 碼動作合規不失格，計時游進 10 歲 B 標：女生 39.89、男生 38.29。'
WHERE id = 'c4b854b3-f337-4799-9631-33c6459951c6';   -- 自由式 50 碼計時 → 自由式 50 碼（B 標）

UPDATE public.skills SET
  name = 'Breaststroke 50 yd (B Standard)',
  pass_criteria = 'Swims a legal 50 yd breaststroke at or under the age-10 B standard: 54.59 girls, 53.49 boys. 蛙式 50 碼動作合規不失格，計時游進 10 歲 B 標：女生 54.59、男生 53.49。'
WHERE id = 'de916eb5-53b3-4ab3-b451-53f793a1666f';   -- 蛙式 50 碼 → 蛙式 50 碼（B 標）

UPDATE public.skills SET
  name = 'Butterfly 50 yd (B Standard)',
  pass_criteria = 'Swims a legal 50 yd butterfly at or under the age-10 B standard: 48.39 girls, 46.49 boys. 蝶式 50 碼動作合規不失格，計時游進 10 歲 B 標：女生 48.39、男生 46.49。'
WHERE id = 'c9047d9f-1b91-4902-a4ce-33e303b4674b';   -- 蝶式 50 碼 → 蝶式 50 碼（B 標）

-- ---------- 3. 五個新技能 ----------
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT '73baf35a-1541-4d95-ade3-85cacd6dbf34', l.id, 'Backstroke 50 yd (B Standard)', 1, 2, true,
       'Swims a legal 50 yd backstroke at or under the age-10 B standard: 48.59 girls, 48.49 boys. 仰式 50 碼動作合規不失格，計時游進 10 歲 B 標：女生 48.59、男生 48.49。', 1
  FROM public.levels l WHERE l.level_number = 7
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria, col_override = EXCLUDED.col_override;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT 'c6c39234-8af8-47bb-b1d2-b33537efcf2b', l.id, 'Freestyle 100 yd (B Standard)', 2, 1, true,
       'Swims a legal 100 yd freestyle at or under the age-10 B standard: 1:30.89 girls, 1:28.49 boys. 自由式 100 碼動作合規不失格，計時游進 10 歲 B 標：女生 1:30.89、男生 1:28.49。', 0
  FROM public.levels l WHERE l.level_number = 7
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria, col_override = EXCLUDED.col_override;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT 'caf1da5f-3ff5-4d73-b479-6f0336dfdc36', l.id, 'Backstroke 100 yd (B Standard)', 2, 2, true,
       'Swims a legal 100 yd backstroke at or under the age-10 B standard: 1:45.79 girls, 1:41.09 boys. 仰式 100 碼動作合規不失格，計時游進 10 歲 B 標：女生 1:45.79、男生 1:41.09。', 1
  FROM public.levels l WHERE l.level_number = 7
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria, col_override = EXCLUDED.col_override;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT '7665ebd2-eb5b-4b00-8ef2-d0ec1039be51', l.id, 'Breaststroke 100 yd (B Standard)', 2, 3, true,
       'Swims a legal 100 yd breaststroke at or under the age-10 B standard: 2:00.29 girls, 1:55.49 boys. 蛙式 100 碼動作合規不失格，計時游進 10 歲 B 標：女生 2:00.29、男生 1:55.49。', 2
  FROM public.levels l WHERE l.level_number = 7
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria, col_override = EXCLUDED.col_override;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT '5e7e292d-e1b7-48de-a32d-24f698dcaae5', l.id, 'Butterfly 100 yd (B Standard)', 2, 4, true,
       'Swims a legal 100 yd butterfly at or under the age-10 B standard: 1:56.69 girls, 1:53.89 boys. 蝶式 100 碼動作合規不失格，計時游進 10 歲 B 標：女生 1:56.69、男生 1:53.89。', 3
  FROM public.levels l WHERE l.level_number = 7
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria, col_override = EXCLUDED.col_override;

-- ---------- 4. 階段、順序、欄位 ----------
UPDATE public.skills SET stage = 1, sort_order = 1, col_override = 0 WHERE id = 'c4b854b3-f337-4799-9631-33c6459951c6';  -- 自由式 50 碼（B 標）
UPDATE public.skills SET stage = 1, sort_order = 2, col_override = 1 WHERE id = '73baf35a-1541-4d95-ade3-85cacd6dbf34';  -- 仰式 50 碼（B 標）
UPDATE public.skills SET stage = 1, sort_order = 3, col_override = 2 WHERE id = 'de916eb5-53b3-4ab3-b451-53f793a1666f';  -- 蛙式 50 碼（B 標）
UPDATE public.skills SET stage = 1, sort_order = 4, col_override = 3 WHERE id = 'c9047d9f-1b91-4902-a4ce-33e303b4674b';  -- 蝶式 50 碼（B 標）

UPDATE public.skills SET stage = 2, sort_order = 1, col_override = 0 WHERE id = 'c6c39234-8af8-47bb-b1d2-b33537efcf2b';  -- 自由式 100 碼（B 標）
UPDATE public.skills SET stage = 2, sort_order = 2, col_override = 1 WHERE id = 'caf1da5f-3ff5-4d73-b479-6f0336dfdc36';  -- 仰式 100 碼（B 標）
UPDATE public.skills SET stage = 2, sort_order = 3, col_override = 2 WHERE id = '7665ebd2-eb5b-4b00-8ef2-d0ec1039be51';  -- 蛙式 100 碼（B 標）
UPDATE public.skills SET stage = 2, sort_order = 4, col_override = 3 WHERE id = '5e7e292d-e1b7-48de-a32d-24f698dcaae5';  -- 蝶式 100 碼（B 標）
UPDATE public.skills SET stage = 2, sort_order = 5, col_override = 4 WHERE id = '58b20bb7-23a5-4ee2-affb-5f16284a7563';  -- 泳式轉換與轉身

UPDATE public.skills SET stage = 3, sort_order = 1, col_override = 0 WHERE id = 'a8d00e21-01af-4ad5-a90d-a7e8bd59e6a8';  -- 自由式 500 碼
UPDATE public.skills SET stage = 3, sort_order = 2, col_override = 1 WHERE id = '840dbdc7-1774-46ce-95ca-fe2f87d23475';  -- 仰式 200 碼
UPDATE public.skills SET stage = 3, sort_order = 3, col_override = 2 WHERE id = 'fb34523b-58c7-4e1f-9cef-a56ebea37757';  -- 蛙式水下划手
UPDATE public.skills SET stage = 3, sort_order = 4, col_override = 4 WHERE id = 'e9f7b834-3e50-446f-a775-33d547ba776b';  -- 個人混合式 100 碼

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L7 應該是 13 個技能，欄位 0..4：
-- select s.stage, s.sort_order, s.col_override, s.name
--   from public.skills s join public.levels l on l.id = s.level_id
--  where l.level_number = 7 and s.is_active
--  order by s.stage, s.sort_order;
