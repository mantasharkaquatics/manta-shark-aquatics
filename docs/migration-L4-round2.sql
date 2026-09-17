-- ============================================================
-- Manta Shark Aquatics — Level 4 第二輪
--
-- 業主決定：
--   仰式 15 碼      → 階段1，改名「仰式分解游」。教的東西也換了：單手回手臂
--                     和單手推水，可以抱浮板。標準／教學／常錯全部重寫。
--   初級仰泳 25 碼  → 階段2，改名「仰式 25 碼」。原本的內容是 Elementary
--                     Backstroke（雙臂對稱＋蛙腿＋滑行），業主要的是真正的
--                     仰式，所以標準／教學／常錯也全部重寫。
--   流線自由式打水  → 階段1，排在 水下自由式打水 正上方
--   蛙腿 10 碼      L5 階段3 → L4 階段3
--   停用            踩水 1 分鐘、坐姿與跪姿入水
--
-- 撞名處理：L5 階段2 原本就有一個「仰式 25 碼」，內容和新的 L4 仰式 25 碼
--   是同一件事。停用 L5 那個，把它寫得比較對的教學（肩膀轉動、小指先入水）
--   併進 L4 這個。L5 仰式 50 碼 改掛 L4 的 仰式 25 碼。
--
-- 前置被牽動到（在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份）：
--   L6 踩水 2 分鐘   原本掛 踩水 1 分鐘 → 改掛 海星漂 30 秒
--   L6 站姿跳水      少了 坐姿與跪姿入水 → 只剩 流線蹬牆
--   L5 仰式 50 碼    掛的仍是「仰式 25 碼」，只是那個技能現在在 L4
--   L5 蛙腿 25 碼    掛的仍是「蛙腿 10 碼」，只是那個技能現在在 L4
--
-- 改完的 L4：
--   階段1  自由式 15 碼、仰式分解游、流線自由式打水
--   階段2  自由式 25 碼、仰式 25 碼、水下自由式打水
--   階段3  蛙腿 10 碼
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 停用 ----------
UPDATE public.skills SET is_active = false
WHERE id IN ('b4e9ff8e-535c-4e5e-bc9a-8ceb9c252113',   -- 踩水 1 分鐘
             'b3a0c2d4-5e6f-4a73-8b92-0c1d2e3f4a53',   -- 坐姿與跪姿入水
             'daefdc4c-aa3f-4df6-b001-4e95569c4d78');  -- L5 仰式 25 碼（跟新的 L4 撞名）

DELETE FROM public.skill_prerequisites
WHERE requires_id IN ('b4e9ff8e-535c-4e5e-bc9a-8ceb9c252113',
                      'b3a0c2d4-5e6f-4a73-8b92-0c1d2e3f4a53',
                      'daefdc4c-aa3f-4df6-b001-4e95569c4d78')
   OR skill_id    IN ('b4e9ff8e-535c-4e5e-bc9a-8ceb9c252113',
                      'b3a0c2d4-5e6f-4a73-8b92-0c1d2e3f4a53',
                      'daefdc4c-aa3f-4df6-b001-4e95569c4d78');

-- ---------- 2. 改名與改標準 ----------
UPDATE public.skills SET
  name = 'Backstroke Single-Arm Drill',
  pass_criteria = 'Holds a board with one arm and swims a full backstroke arm with the other for 15 yards, both sides: arm straight overhead, little finger first, pushing past the thigh. 一手抱浮板、另一手做完整的仰式划手 15 碼，左右各一趟：手臂伸直過頭、小指先入水，推水推到大腿旁邊。'
WHERE id = '96c47b53-df33-4b4a-9a8e-a84eed10c7b8';   -- 仰式 15 碼 → 仰式分解游

UPDATE public.skills SET
  name = 'Backstroke 25 yd',
  pass_criteria = 'Backstroke 25 yards without stopping, shoulders rolling and the head steady, little finger entering first and the push finishing past the thigh. 仰式 25 碼不停，肩膀有轉動、頭部穩定；手臂小指先入水，推水推到大腿。'
WHERE id = 'c1a0c2d4-5e6f-4a81-8b92-0c1d2e3f4a61';   -- 初級仰泳 25 碼 → 仰式 25 碼

-- ---------- 3. 蛙腿 10 碼 搬到 L4 ----------
UPDATE public.skills s SET level_id = l.id, stage = 3, sort_order = 1
  FROM public.levels l
 WHERE s.id = 'b02f51e3-1e69-487e-86b1-18e21ddb6812'
   AND l.level_number = 4;

-- ---------- 4. 階段與順序 ----------
UPDATE public.skills SET stage = 1, sort_order = 1 WHERE id = 'dff814b2-90df-4043-aeb3-dd4e4df64fbe';  -- 自由式 15 碼
UPDATE public.skills SET stage = 1, sort_order = 2 WHERE id = '96c47b53-df33-4b4a-9a8e-a84eed10c7b8';  -- 仰式分解游
UPDATE public.skills SET stage = 1, sort_order = 3 WHERE id = '818b6b3b-63b9-4e13-9a52-f3f466f57cc7';  -- 流線自由式打水

UPDATE public.skills SET stage = 2, sort_order = 1 WHERE id = '91e61121-5528-456b-9e7d-b97953ed0c39';  -- 自由式 25 碼
UPDATE public.skills SET stage = 2, sort_order = 2 WHERE id = 'c1a0c2d4-5e6f-4a81-8b92-0c1d2e3f4a61';  -- 仰式 25 碼
UPDATE public.skills SET stage = 2, sort_order = 3 WHERE id = '9722f505-b208-43dc-868d-495ba0f3c10e';  -- 水下自由式打水

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L4 應該是 7 個、L5 少兩個：
-- select l.level_number, s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number in (4,5) and s.is_active
--  order by l.level_number, s.stage, s.sort_order;
