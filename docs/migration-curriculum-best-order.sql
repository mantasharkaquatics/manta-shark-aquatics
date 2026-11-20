-- ============================================================
-- Manta Shark Aquatics — 最佳教學順序（業主 2026-11-20「全部照改」）
--
-- 依據：紅十字會、YMCA、Swim England、加拿大救生協會、USA Swimming、
-- Lawton《Complete Guide to Primary Swimming》、Rushall、Swim Wales。
--
-- 1. 新增 2 個技能
--    扶牆側轉換氣 10 次（2 級段 3）：側換氣從 2 級就開始，不先學抬頭換氣
--    蛙式划手配呼吸（5 級段 1）：蛙式先配好手和呼吸，再接蛙腿
-- 2. 重新啟用 3 個踩水
--    踩水 30 秒（3 級段 2）、1 分鐘（4 級段 2）、2 分鐘（6 級段 2）
-- 3. 移動 2 個仰式分解，排在游距離之前
--    側身六踢轉換：5 級段 3 → 4 級段 1
--    單手仰式：5 級段 3 → 4 級段 3
-- 4. 改通過標準 3 個
--    自由式打水 25 碼、自由式打水 10 碼（無浮板）：抬頭換氣 → 側轉換氣
--    水域安全測驗：照紅十字會「水中自保」五步（漂浮或踩水 1 分鐘、轉一圈找出口）
--
-- 技能從 85 個變成 90 個。級數、階段名稱、升級規則都不變。
-- 前置關係在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 兩個資料庫（正式 uobflteojebscsfiortb、測試 manta-dev）都要跑。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 新增 2 個技能 ----------
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT 'a35fa45c-35d8-4a9c-a5bf-bbba46bc1357', l.id, 'Rotary Breathing at the Wall', 3, 2, true,
       'Holding the wall with both hands, face in and blowing out, rolls the head to one side to breathe in with one ear staying in the water, then back down -- ten in a row without lifting the head. 雙手扶牆、臉入水吐氣，頭轉向一側吸氣，一邊耳朵留在水裡，再轉回水裡——連續 10 次，頭不抬起來。', NULL
  FROM public.levels l WHERE l.level_number = 2
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria, col_override = EXCLUDED.col_override;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria, col_override)
SELECT 'c69275d3-d60d-45a4-b3ef-6577d1c97eb2', l.id, 'Breaststroke Arms with Breathing', 1, 5, true,
       '10 yards of breaststroke arms with a flutter kick or a pull buoy: hands sweep out and in, the chin lifts to breathe as the hands come in, and the face goes back down as the hands shoot forward. 用自由式打水或夾浮板游 10 碼蛙式划手：雙手向外再向內划，手往內收時抬下巴吸氣，手往前伸時臉回到水裡。', NULL
  FROM public.levels l WHERE l.level_number = 5
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria, col_override = EXCLUDED.col_override;

-- ---------- 2. 重新啟用 3 個踩水（名字改回只有英文，中文在 db-strings） ----------
UPDATE public.skills s SET is_active = true, name = 'Treading Water 30 sec', stage = 2, sort_order = 5,
       level_id = (SELECT id FROM public.levels WHERE level_number = 3)
 WHERE s.id = '4dd3928b-8433-40c4-8057-29b454ce5a03';
UPDATE public.skills s SET is_active = true, name = 'Treading Water 1 min', stage = 2, sort_order = 5,
       level_id = (SELECT id FROM public.levels WHERE level_number = 4)
 WHERE s.id = 'b4e9ff8e-535c-4e5e-bc9a-8ceb9c252113';
UPDATE public.skills s SET is_active = true, name = 'Treading Water 2 min', stage = 2, sort_order = 5,
       level_id = (SELECT id FROM public.levels WHERE level_number = 6)
 WHERE s.id = '3c01a30f-147d-4880-9738-75c245fc3325';

-- ---------- 3. 仰式分解移到 4 級（拿掉 5 級版面用的欄位釘選） ----------
UPDATE public.skills SET level_id = (SELECT id FROM public.levels WHERE level_number = 4), stage = 1, sort_order = 4, col_override = NULL
 WHERE id = 'd6b2ba7b-5a81-4247-8532-d9eb078f71bd';   -- 側身六踢轉換
UPDATE public.skills SET level_id = (SELECT id FROM public.levels WHERE level_number = 4), stage = 3, sort_order = 4, col_override = NULL
 WHERE id = '4093e9eb-c077-4efa-9dc7-2a8378163b2b';   -- 單手仰式

-- 同一段裡其他技能讓出位置
UPDATE public.skills SET sort_order = 3 WHERE id = 'ed0e69e4-3edb-4668-84d8-a39064fe2425';   -- 水中撿物
UPDATE public.skills SET sort_order = 4 WHERE id = 'c7022acb-3075-471f-8c45-4d5330139369';   -- 吐泡跳（過頭深）
UPDATE public.skills SET sort_order = 5 WHERE id = '63f1fc23-f60a-4417-86e1-2d4dd2d191c3';   -- 跳入深水
UPDATE public.skills SET sort_order = 5 WHERE id = 'c820d2cd-86af-4412-a6bb-06f70a23ac22';   -- 蛙腿分解練習
UPDATE public.skills SET sort_order = 5 WHERE id = '6bf527f0-5e39-48bb-b975-6e29829b5d7c';   -- 仰式 25 碼
UPDATE public.skills SET sort_order = 6 WHERE id = '327265d2-e212-4917-90d9-21daa2a5520e';   -- 蝶式打水 25 碼
UPDATE public.skills SET sort_order = 2 WHERE id = '59628c84-eead-4393-9e2e-5774670383ca';   -- 雙手仰式
UPDATE public.skills SET sort_order = 3 WHERE id = '0ff7355f-2cef-42b9-afa2-0749603d6c33';   -- 開放式轉身

-- ---------- 4. 改通過標準 ----------
UPDATE public.skills SET pass_criteria = 'Kicks 25 yards with a board without stopping or standing up, breathing to the side: one hand on the board, the other arm by the side, the head rolls toward that side for the breath and straight back down. 扶板打水 25 碼，中途不停、不站起來；換氣用側轉：一手扶板、一手貼身，頭轉向貼身那一側吸一口，馬上轉回水裡。'
 WHERE id = 'e8fd87dc-4e41-4ea5-adda-d8038881f573';   -- 自由式打水 25 碼
UPDATE public.skills SET pass_criteria = 'Kicks 10 yards with no board, one arm extended in front and the other at the side, rolling toward the resting arm to breathe and back face-down, kick never stopping. 不拿浮板打水 10 碼：一手往前伸直、一手貼身，往貼身那一側轉頭換氣再轉回來，腳全程不停。'
 WHERE id = '9ac7c46d-2f0f-495b-a0cc-95a13e6684fc';   -- 自由式打水 10 碼（無浮板）
UPDATE public.skills SET pass_criteria = 'One unbroken run, never holding the wall: jump into deep water from the deck and come back to the surface; float on the back or tread water for 1 minute; turn a full circle and find the exit; swim 15 yards to it without stopping; climb out without the ladder. 一次做完不中斷、全程不扶牆：從池邊跳進深水、浮上水面；仰漂或踩水 1 分鐘；在原地轉一圈、找到出口；不停地游 15 碼到出口；不用梯子自己爬上岸。'
 WHERE id = '997642b0-c290-48cf-a53f-ccb46d52d539';   -- 水域安全測驗

-- 檢查：啟用中的技能應該是 90 個
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.skills WHERE is_active;
  IF n <> 90 THEN RAISE EXCEPTION '啟用中的技能是 % 個，應該是 90 個', n; END IF;
END $$;

COMMIT;
