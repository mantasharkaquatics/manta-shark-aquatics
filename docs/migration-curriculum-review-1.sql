-- ============================================================
-- Manta Shark Aquatics — 課程總檢視的第一批修正
--
-- 1. 划手前進 5 碼（L2）標準整條寫錯了
--    寫的是「仰躺以八字划手前進 5 碼」，但這一條要教的是俯臥的自由式
--    划手：臉入水憋一口氣，只用手往前划五碼，不換氣、不看動作標準。
--    英文名 Sculling 5 yd 也跟著改成 Freestyle Pull 5 yd。
--    （前置本來就是 自由式打水 10 碼（浮板），是對的，不用動。）
--
-- 2. 開放式轉身（L5）標準提到還沒教的蝶式
--    標準只留蛙式；蝶式要到 L6 才游得出來，這件事移到教學重點。
--
-- 3. 吐泡跳（過頭深）（L2）補上不扶牆
--    L3 的水域安全測驗要求五個吐泡跳不能扶牆，但中間沒有一步練過放手。
--    標準改成：前七次可以扶牆，最後三次放開牆壁自己做。
--
-- 4. L6 階段3 補 蝶式 50 碼、蛙式 50 碼（都不計時）
--    自由式進 L7 前游過 200 碼、仰式游過 100 碼，蛙式和蝶式只游過 25 碼，
--    下一步卻是計時的合規 50 碼 —— 整個課程最大的一個跳躍，剛好落在
--    最累的兩式。補上之後 L7 那兩關改成接在 50 碼後面。
--    L6 變成 13 個技能、六欄。
--
-- 5. L7 全部改成水中出發計時
--    池子太淺，不做跳水出發。USA Swimming 的秒數是跳水計的，水中出發
--    大約慢 0.8 到 1 秒 —— 秒數不動，所以我們的量法比官方嚴，這件事
--    寫進每一條標準和級別說明裡。
--
-- 6. 泳式轉換與轉身 本來沒有可以驗收的標準
--    全課程只有這一條寫得出「合規銜接」卻沒說要做什麼。
--    改成：蝶轉仰、仰轉蛙、蛙轉自 各做一次，順序不錯、觸壁與轉身合規。
--
-- 7. 自由式 500 碼 的標準和對外目標講的不是同一件事
--    標準只寫「能自己數趟數」，/levels 卻承諾「每 50 碼配速控得住」。
--    以配速那版為準（L6 的 200 碼已經在要求配速了）。
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 划手前進 5 碼：改名並重寫標準 ----------
UPDATE public.skills SET name = 'Freestyle Pull 5 yd', pass_criteria = 'Face in and holding one breath, travels 5 yd on freestyle arms alone — no breathing, and form is not the point: moving forward on their own is. 臉入水憋一口氣，只用自由式划手前進 5 碼，全程不換氣；這一條不看動作標準，能自己往前移動就算過。'
WHERE id = 'b1a0c2d4-5e6f-4a71-8b92-0c1d2e3f4a51';   -- 划手前進 5 碼

-- ---------- 2–3. 兩條標準重寫 ----------
UPDATE public.skills SET pass_criteria = 'Two-hand touch, open turn and push-off in breaststroke. 蛙式的雙手同時觸壁、平轉身並蹬牆。' WHERE id = '0ff7355f-2cef-42b9-afa2-0749603d6c33';   -- 開放式轉身
UPDATE public.skills SET pass_criteria = 'Ten in a row in water over their head: down, breathe out, up, in rhythm — the wall is allowed for the first seven, the last three without it. 過頭深的水中連續十次：下沉、吐氣、浮起，有節奏不中斷；前七次可以扶牆，最後三次放開牆壁自己做。' WHERE id = 'c7022acb-3075-471f-8c45-4d5330139369';   -- 吐泡跳（過頭深）

-- ---------- 4. L6 階段3 兩個新技能 ----------
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT 'e1283362-5c0d-475b-a9ae-9ea777f9ddba', l.id, 'Butterfly 50 yd', 3, 2, true,
       '50 yards of butterfly with a legal open turn, two kicks to a pull all the way to the wall. 蝶式 50 碼含一次合規的平轉身，一划兩踢的節奏維持到觸壁。', 1
  FROM public.levels l WHERE l.level_number = 6
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria, col_override = EXCLUDED.col_override;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT '8a650e1c-278e-4ddb-8069-f7495a620dde', l.id, 'Breaststroke 50 yd', 3, 3, true,
       '50 yards of breaststroke with a legal open turn, a visible glide in every cycle. 蛙式 50 碼含一次合規的平轉身，每一循環都看得到滑行。', 3
  FROM public.levels l WHERE l.level_number = 6
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria, col_override = EXCLUDED.col_override;

-- L6 階段3 的兩個蛙式技術游往右挪，空出蛙式那一欄給 蛙式 50 碼
UPDATE public.skills SET stage = 3, sort_order = 4, col_override = 4 WHERE id = 'f23977ee-2739-493a-b1f1-2547e29b5011';   -- 蛙式技術游（一手兩腳）
UPDATE public.skills SET stage = 3, sort_order = 5, col_override = 5 WHERE id = '01b6ee5e-44fc-40f5-a4ac-ebdc0cd6df36';   -- 蛙式技術游（一蛙腳一蝶腳）

-- ---------- 5. L7 八條計時標準改成水中出發 ----------
UPDATE public.skills SET pass_criteria = 'Swims a legal 50 yd freestyle from a push start, at or under the age-10 B standard: 39.89 girls, 38.29 boys. 自由式 50 碼動作合規不失格，水中出發計時游進 10 歲 B 標：女生 39.89、男生 38.29。' WHERE id = 'c4b854b3-f337-4799-9631-33c6459951c6';   -- 自由式 50 碼（B 標）
UPDATE public.skills SET pass_criteria = 'Swims a legal 50 yd backstroke from a push start, at or under the age-10 B standard: 48.59 girls, 48.49 boys. 仰式 50 碼動作合規不失格，水中出發計時游進 10 歲 B 標：女生 48.59、男生 48.49。' WHERE id = '73baf35a-1541-4d95-ade3-85cacd6dbf34';   -- 仰式 50 碼（B 標）
UPDATE public.skills SET pass_criteria = 'Swims a legal 50 yd breaststroke from a push start, at or under the age-10 B standard: 54.59 girls, 53.49 boys. 蛙式 50 碼動作合規不失格，水中出發計時游進 10 歲 B 標：女生 54.59、男生 53.49。' WHERE id = 'de916eb5-53b3-4ab3-b451-53f793a1666f';   -- 蛙式 50 碼（B 標）
UPDATE public.skills SET pass_criteria = 'Swims a legal 50 yd butterfly from a push start, at or under the age-10 B standard: 48.39 girls, 46.49 boys. 蝶式 50 碼動作合規不失格，水中出發計時游進 10 歲 B 標：女生 48.39、男生 46.49。' WHERE id = 'c9047d9f-1b91-4902-a4ce-33e303b4674b';   -- 蝶式 50 碼（B 標）
UPDATE public.skills SET pass_criteria = 'Swims a legal 100 yd freestyle from a push start, at or under the age-10 B standard: 1:30.89 girls, 1:28.49 boys. 自由式 100 碼動作合規不失格，水中出發計時游進 10 歲 B 標：女生 1:30.89、男生 1:28.49。' WHERE id = 'c6c39234-8af8-47bb-b1d2-b33537efcf2b';   -- 自由式 100 碼（B 標）
UPDATE public.skills SET pass_criteria = 'Swims a legal 100 yd backstroke from a push start, at or under the age-10 B standard: 1:45.79 girls, 1:41.09 boys. 仰式 100 碼動作合規不失格，水中出發計時游進 10 歲 B 標：女生 1:45.79、男生 1:41.09。' WHERE id = 'caf1da5f-3ff5-4d73-b479-6f0336dfdc36';   -- 仰式 100 碼（B 標）
UPDATE public.skills SET pass_criteria = 'Swims a legal 100 yd breaststroke from a push start, at or under the age-10 B standard: 2:00.29 girls, 1:55.49 boys. 蛙式 100 碼動作合規不失格，水中出發計時游進 10 歲 B 標：女生 2:00.29、男生 1:55.49。' WHERE id = '7665ebd2-eb5b-4b00-8ef2-d0ec1039be51';   -- 蛙式 100 碼（B 標）
UPDATE public.skills SET pass_criteria = 'Swims a legal 100 yd butterfly from a push start, at or under the age-10 B standard: 1:56.69 girls, 1:53.89 boys. 蝶式 100 碼動作合規不失格，水中出發計時游進 10 歲 B 標：女生 1:56.69、男生 1:53.89。' WHERE id = '5e7e292d-e1b7-48de-a32d-24f698dcaae5';   -- 蝶式 100 碼（B 標）

-- ---------- 6–7. 兩條標準重寫 ----------
UPDATE public.skills SET pass_criteria = 'One of each medley transition — fly to back, back to breast, breast to free — in the right order, every touch and turn legal. 蝶轉仰、仰轉蛙、蛙轉自 三個銜接各做一次，順序不錯，每一次觸壁與轉身都合規不失格。' WHERE id = '58b20bb7-23a5-4ee2-affb-5f16284a7563';   -- 泳式轉換與轉身
UPDATE public.skills SET pass_criteria = '500 yards of freestyle, counting their own laps, every 50 within five seconds of the one before. 連續自由式 500 碼，自己數趟數，每 50 碼的配速差距在 5 秒內。' WHERE id = 'a8d00e21-01af-4ad5-a90d-a7e8bd59e6a8';   -- 自由式 500 碼

COMMIT;

-- ----------- 跑完的驗證 -----------
-- 在用的技能應該是 85 個：
-- select count(*) from skills where is_active;
--
-- L6 應該是 13 個，階段 1/2/3 各 4/4/5，欄位 0..5：
-- select s.stage, s.sort_order, s.col_override, s.name
--   from public.skills s join public.levels l on l.id = s.level_id
--  where l.level_number = 6 and s.is_active
--  order by s.stage, s.sort_order;
