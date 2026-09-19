-- ============================================================
-- Manta Shark Aquatics — L6 加兩個蛙式技術游，個人混合式打水 移位
--
-- 業主決定：
--   個人混合式打水  移到 自由式 200 碼 正下方（階段2，不連線）
--   新增  蛙式技術游（一手兩腳）    階段3，掛 蛙式 25 碼
--   新增  蛙式技術游（一蛙腳一蝶腳）階段3，掛 蛙式 25 碼
--
-- 改完的 L6（11 個技能）：
--   階段1  自由式 200 碼 · 蝶式 10 碼 · 仰式 100 碼 · 蛙式 15 碼
--   階段2  個人混合式打水 · 蝶式 25 碼 · 仰式翻滾轉身 · 蛙式 25 碼
--   階段3  　　　　　　 · 水下海豚腿 ·          · 一手兩腳 · 一蛙腳一蝶腳
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT 'f23977ee-2739-493a-b1f1-2547e29b5011', l.id, 'Breaststroke Drill: One Pull, Two Kicks', 3, 2, true,
       '25 yards with one pull to every two kicks, a visible glide after each kick and the order never breaking down. 一次划手配兩次蛙腿，游 25 碼；每一蹬之後都看得到滑行，順序不亂。', 3
  FROM public.levels l WHERE l.level_number = 6
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name, stage = EXCLUDED.stage,
  sort_order = EXCLUDED.sort_order, is_active = true, pass_criteria = EXCLUDED.pass_criteria,
  col_override = EXCLUDED.col_override;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT '01b6ee5e-44fc-40f5-a4ac-ebdc0cd6df36', l.id, 'Breaststroke Drill: Breast and Dolphin Kick', 3, 3, true,
       '25 yards alternating one breaststroke kick with one dolphin kick, the two clearly distinct and the feet turning out on the breaststroke kick. 一次蛙腿、一次海豚腿交替，游 25 碼；兩種腿分得清清楚楚，蛙腿時腳掌有翻出去。', 4
  FROM public.levels l WHERE l.level_number = 6
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name, stage = EXCLUDED.stage,
  sort_order = EXCLUDED.sort_order, is_active = true, pass_criteria = EXCLUDED.pass_criteria,
  col_override = EXCLUDED.col_override;

UPDATE public.skills SET stage = 2, sort_order = 4, col_override = 0
WHERE id = 'b7525cfb-5d9b-43b2-9868-393578adf991';   -- 個人混合式打水

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L6 應該是 11 個技能：
-- select s.stage, s.sort_order, s.col_override, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 6 and s.is_active
--  order by s.stage, s.sort_order;
