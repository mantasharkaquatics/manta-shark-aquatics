-- ============================================================
-- Manta Shark Aquatics — Level 5 仰式那一欄長出來
--
-- 業主決定：
--   新增  仰式蝶腳（階段2）—— 水面上的反蝶打水，掛 仰式 50 碼
--   新增  單手仰式、雙手仰式、側身六踢轉換（階段3）—— 三個都掛 仰式蝶腳
--
-- 「右二左二」沒有做成仰式版：自由式做右二左二有意義，是因為沒在划的那隻手
-- 伸直在前面，是個很明確的參考點；仰式沒在划的那隻手貼在大腿旁邊，所以
-- 「右手連續兩下」本質上就是單手仰式。兩個都加會重複，所以只留 單手仰式。
--
-- 改完的 L5（13 個技能），從左到右：
--   階段1  自由式 50 碼 ·        · 仰式 50 碼 ·        · 蛙腿 25 碼 · 自手蝶腳
--   階段2  自由式 100 碼 ·       · 仰式蝶腳 ·          · 蛙式 10 碼 · 單手蝶式
--   階段3  自由式翻滾轉身 · 單手仰式 · 雙手仰式 · 側身六踢轉換 · 開放式轉身
--
-- 階段1、2 中間留的兩個空格不是漏掉的：仰式那一欄在階段3 要展開成三個，
-- col_override 把上面兩排撐開，讓那個三叉是對稱的。
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 新增四個技能 ----------
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT '2cd9fcb7-cb6d-4853-95c0-97f3acc443d7', l.id, 'Backstroke Dolphin Kick', 2, 2, true,
       '25 yards of dolphin kick on the back, arms overhead, the wave driven from the chest, hips at the surface and the knees never breaking it. 仰躺雙手過頭夾緊、蝶式打水 25 碼，波浪由胸口帶動，臀部貼近水面、膝蓋不出水面。', 2
  FROM public.levels l WHERE l.level_number = 5
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name, stage = EXCLUDED.stage,
  sort_order = EXCLUDED.sort_order, is_active = true, pass_criteria = EXCLUDED.pass_criteria,
  col_override = EXCLUDED.col_override;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT '4093e9eb-c077-4efa-9dc7-2a8378163b2b', l.id, 'Single-Arm Backstroke', 3, 2, true,
       'Single-arm backstroke 25 yards each side, the resting arm still at the thigh, the working shoulder rolling clear of the water. 單手仰式 25 碼，左右各一趟；沒在划的那隻手貼大腿不動，划手那邊的肩膀轉出水面。', 1
  FROM public.levels l WHERE l.level_number = 5
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name, stage = EXCLUDED.stage,
  sort_order = EXCLUDED.sort_order, is_active = true, pass_criteria = EXCLUDED.pass_criteria,
  col_override = EXCLUDED.col_override;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT '59628c84-eead-4393-9e2e-5774670383ca', l.id, 'Double-Arm Backstroke', 3, 3, true,
       'Double-arm backstroke 15 yards, both arms entering overhead and finishing at the thighs together, no roll, hips at the surface. 雙手仰式 15 碼，兩手同時從頭頂入水、同時推到大腿，全程不轉肩，臀部貼近水面。', 2
  FROM public.levels l WHERE l.level_number = 5
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name, stage = EXCLUDED.stage,
  sort_order = EXCLUDED.sort_order, is_active = true, pass_criteria = EXCLUDED.pass_criteria,
  col_override = EXCLUDED.col_override;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT 'd6b2ba7b-5a81-4247-8532-d9eb078f71bd', l.id, 'Backstroke Six-Kick Switch', 3, 4, true,
       'Six kicks on the side then one stroke to switch, 25 yards, one arm extended overhead throughout and the eyes holding one point. 側躺打水六下、划一下換邊，游 25 碼；全程一隻手伸直在頭頂，眼睛盯著同一個點。', 3
  FROM public.levels l WHERE l.level_number = 5
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name, stage = EXCLUDED.stage,
  sort_order = EXCLUDED.sort_order, is_active = true, pass_criteria = EXCLUDED.pass_criteria,
  col_override = EXCLUDED.col_override;

-- ---------- 2. 階段、順序、欄位 ----------
UPDATE public.skills SET stage = 1, sort_order = 1, col_override = 0 WHERE id = 'be760433-09d7-4cac-9863-fa758abc9009';  -- 自由式 50 碼
UPDATE public.skills SET stage = 1, sort_order = 2, col_override = 2 WHERE id = '97804fbb-13d4-4367-ab9d-0276b25591d6';  -- 仰式 50 碼
UPDATE public.skills SET stage = 1, sort_order = 3, col_override = 4 WHERE id = 'e858562b-a3aa-4875-84ef-e1f6875770e5';  -- 蛙腿 25 碼
UPDATE public.skills SET stage = 1, sort_order = 4, col_override = 5 WHERE id = '8aadc967-9b3f-430b-b161-273001ffa21a';  -- 自手蝶腳

UPDATE public.skills SET stage = 2, sort_order = 1, col_override = 0 WHERE id = '18a6462c-4c67-4e93-8838-8bc03717b463';  -- 自由式 100 碼
UPDATE public.skills SET stage = 2, sort_order = 3, col_override = 4 WHERE id = 'ee7b11f4-bb68-4868-95c9-62270c9ae576';  -- 蛙式 10 碼
UPDATE public.skills SET stage = 2, sort_order = 4, col_override = 5 WHERE id = '6d6b06d9-7b44-4980-a1a6-a4ab887d5ede';  -- 單手蝶式

UPDATE public.skills SET stage = 3, sort_order = 1, col_override = 0 WHERE id = '22e00423-edc5-4626-8e7f-8bc4e846203f';  -- 自由式翻滾轉身
UPDATE public.skills SET stage = 3, sort_order = 5, col_override = 4 WHERE id = '0ff7355f-2cef-42b9-afa2-0749603d6c33';  -- 開放式轉身

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L5 應該是 13 個技能：
-- select s.stage, s.sort_order, s.col_override, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 5 and s.is_active
--  order by s.stage, s.sort_order;
