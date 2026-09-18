-- ============================================================
-- Manta Shark Aquatics — L4 加 25 碼自由式衝刺，水下打水改 5 碼
--
-- 業主決定：
--   新增  25 碼自由式衝刺（階段3），排在 水下自由式打水 正下方，掛 自由式 25 碼
--         （sort_order 3、col_override 1 是欄位對調之後的最終值）
--   水下自由式打水 的標準從 10 碼 改成 5 碼
--
-- ⚠ L7 階段1 有一個「自由式 25 碼衝刺」（Freestyle 25 yd Sprint，標準是全力
--   衝刺、最後 5 碼不換氣）。這個新的叫「25 碼自由式衝刺」，只有語序不同，
--   是兩個不同的技能。英文名刻意取得不一樣（Freestyle 25 yd for Speed），
--   L4 這個要的是「快起來動作還在不在」，不要求閉氣。排到 L7 的時候要決定
--   兩個名字是不是都留。
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT 'de640a60-96c1-4616-bcd2-f29f1aa61ed8', l.id, 'Freestyle 25 yd for Speed', 3, 3, true,
       'Swims 25 yards freestyle as fast as he can with the stroke holding together and no more breaths than an easy 25. 自由式 25 碼盡全力游，全程動作不散，換氣次數不比平常那一趟多。', 1
  FROM public.levels l WHERE l.level_number = 4
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria, col_override = EXCLUDED.col_override;

UPDATE public.skills SET
  pass_criteria = 'Kicks 5 yd fully underwater in streamline on one breath. 一口氣在水面下以流線型打水 5 碼。'
WHERE id = '9722f505-b208-43dc-868d-495ba0f3c10e';   -- 水下自由式打水

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L4 應該是 13 個技能：
-- select s.stage, s.sort_order, s.col_override, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 4 and s.is_active
--  order by s.stage, s.sort_order;
