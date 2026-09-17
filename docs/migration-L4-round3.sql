-- ============================================================
-- Manta Shark Aquatics — Level 4 第三輪
--
-- 業主決定：
--   仰式 25 碼    → 改成 仰式 15 碼（留在階段2）
--   新增          仰式 25 碼（階段3）—— 距離上的下一步，掛 仰式 15 碼
--   新增          蛙腿分解練習（階段1）—— 扶牆／扶板做「收、翻、蹬、併」四拍
--   蛙腿 10 碼    階段3 → 階段2，掛 蛙腿分解練習
--   海豚腿 25 碼  L5 階段3 → L4 階段3，改名 蝶式打水 25 碼
--
-- 「25 碼自由式衝刺」這一項這輪沒加：L7 階段1 已經有一個 自由式 25 碼衝刺，
-- 兩個同名會讓課程資料檔壞掉。等排到 L7 決定要把那個搬下來還是改名再補。
--
-- 蝶式打水 25 碼 是搬動不是新開：L6 的 蝶式 10 碼、個人混合式打水、水下海豚腿
-- 三個都掛在它下面，搬動保住那三條線，也保住已經拿到成績的學生。
--
-- 改完的 L4（10 個技能）：
--   階段1  自由式 15 碼、仰式分解游、流線自由式打水、蛙腿分解練習
--   階段2  自由式 25 碼、仰式 15 碼、水下自由式打水、蛙腿 10 碼
--   階段3  蝶式打水 25 碼、仰式 25 碼
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 改名與改標準 ----------
UPDATE public.skills SET
  name = 'Backstroke 15 yd',
  pass_criteria = 'Backstroke 15 yards without stopping, shoulders rolling and the head steady, little finger entering first and the push finishing past the thigh. 仰式 15 碼不停，肩膀有轉動、頭部穩定；手臂小指先入水，推水推到大腿。'
WHERE id = 'c1a0c2d4-5e6f-4a81-8b92-0c1d2e3f4a61';   -- 仰式 25 碼 → 仰式 15 碼

UPDATE public.skills SET
  name = 'Butterfly Kick 25 yd',
  pass_criteria = 'Butterfly kick 25 yards on a board, face down, the wave driven from the chest. 扶板俯身蝶式打水 25 碼，波浪由胸口帶動。'
WHERE id = '327265d2-e212-4917-90d9-21daa2a5520e';   -- 海豚腿 25 碼 → 蝶式打水 25 碼

-- ---------- 2. 蝶式打水 25 碼 搬到 L4 ----------
UPDATE public.skills s SET level_id = l.id, stage = 3, sort_order = 1
  FROM public.levels l
 WHERE s.id = '327265d2-e212-4917-90d9-21daa2a5520e'
   AND l.level_number = 4;

-- ---------- 3. 新增兩個技能 ----------
INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT '6bf527f0-5e39-48bb-b975-6e29829b5d7c', l.id, 'Backstroke 25 yd', 3, 2, true,
       'Backstroke 25 yards without stopping, holding a straight line, the stroke as good on the second half as the first. 仰式 25 碼不停，能維持直線，後半段的動作跟前半段一樣。'
  FROM public.levels l WHERE l.level_number = 4
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT 'c820d2cd-86af-4412-a6bb-06f70a23ac22', l.id, 'Breaststroke Kick Drill', 1, 4, true,
       'Ten breaststroke kicks at the wall or on a board, the four counts -- heels up, feet out, drive, together -- clearly separated. 扶牆或扶板做蛙腿 10 次：收腿到臀、腳掌翻出去、蹬開、併攏，四拍分得清楚。'
  FROM public.levels l WHERE l.level_number = 4
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

-- ---------- 4. 階段與順序 ----------
UPDATE public.skills SET stage = 1, sort_order = 1 WHERE id = 'dff814b2-90df-4043-aeb3-dd4e4df64fbe';  -- 自由式 15 碼
UPDATE public.skills SET stage = 1, sort_order = 2 WHERE id = '96c47b53-df33-4b4a-9a8e-a84eed10c7b8';  -- 仰式分解游
UPDATE public.skills SET stage = 1, sort_order = 3 WHERE id = '818b6b3b-63b9-4e13-9a52-f3f466f57cc7';  -- 流線自由式打水
UPDATE public.skills SET stage = 1, sort_order = 4 WHERE id = 'c820d2cd-86af-4412-a6bb-06f70a23ac22';  -- 蛙腿分解練習

UPDATE public.skills SET stage = 2, sort_order = 1 WHERE id = '91e61121-5528-456b-9e7d-b97953ed0c39';  -- 自由式 25 碼
UPDATE public.skills SET stage = 2, sort_order = 2 WHERE id = 'c1a0c2d4-5e6f-4a81-8b92-0c1d2e3f4a61';  -- 仰式 15 碼
UPDATE public.skills SET stage = 2, sort_order = 3 WHERE id = '9722f505-b208-43dc-868d-495ba0f3c10e';  -- 水下自由式打水
UPDATE public.skills SET stage = 2, sort_order = 4 WHERE id = 'b02f51e3-1e69-487e-86b1-18e21ddb6812';  -- 蛙腿 10 碼

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L4 應該是 10 個、L5 少一個：
-- select l.level_number, s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number in (4,5) and s.is_active
--  order by l.level_number, s.stage, s.sort_order;
