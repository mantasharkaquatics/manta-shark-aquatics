-- ============================================================
-- Manta Shark Aquatics — 水域安全測驗改成業主的流程
--
-- 測驗流程（業主定的）：
--   從池邊跳進深水 → 下潛撿玩具 → 五個吐泡跳 → 把玩具交給教練
--   → 海星漂 30 秒 → 自由式打水 10 碼到指定位置 → 自己爬上岸
--
-- 對照課程之後有兩個缺口，這份補起來：
--   1. 仰漂 30 秒 —— 測驗要 30 秒，L3 結束前只教到 10 秒（L2 海星漂 10 秒），
--      30 秒的版本原本在 L4。把它搬到 L3 階段 2，不是新開一個技能：
--      搬動保住已經拿到這項成績的學生，也保住 L4 水中自保驗收 對它的前置。
--   2. 跳進深水 —— 原本只教到 跳入胸深水，但下一步要在深水下潛撿物。
--      把 跳入胸深水 升級成 跳入深水（標準改寫，前置加上 吐泡跳（過頭深）：
--      過頭深的水裡站得住，才准往深水跳）。
--
-- 順便：L4 階段 3 少了一個技能，重新編號 1-4。
--
-- 中文名稱不在資料庫裡（skills.name 是英文，中文走 db-strings.json），
-- 所以「大字漂 → 海星漂」這個改名不需要 SQL。
--
-- 前置關係在 docs/migration-skill-prerequisites.sql（先跑這份，再跑那份）。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 海星漂 30 秒：L4 → L3 階段 2 ----------
UPDATE public.skills s SET
  level_id      = l.id,
  stage         = 2,
  sort_order    = 4,
  pass_criteria = 'Starfish floats on the back for 30 seconds in deep water, relaxed, without sculling. 深水中仰躺海星漂 30 秒，放鬆、不靠划手。'
  FROM public.levels l
 WHERE s.id = '806e2b61-f66e-460b-b31b-264097fee097'
   AND l.level_number = 3;

-- ---------- 2. 跳入胸深水 → 跳入深水 ----------
UPDATE public.skills SET
  name          = 'Jump into Deep Water',
  pass_criteria = 'Jumps feet-first from the deck into deep water, surfaces and returns to the wall unaided, with nobody catching him. 從池邊雙腳跳進深水，自己浮起來回到池壁，不需要人接。'
WHERE id = '63f1fc23-f60a-4417-86e1-2d4dd2d191c3';

-- ---------- 3. 水域安全測驗的標準 ----------
UPDATE public.skills SET
  pass_criteria = 'One unbroken run: jump into deep water from the deck, submerge and retrieve the toy, five bobs, hand the toy to the coach, starfish float 30 seconds, freestyle kick 10 yards to the mark, and climb out unaided. 一次做完不中斷：從池邊跳進深水、下潛撿起玩具、五個吐泡跳、把玩具交給教練、海星漂 30 秒、自由式打水 10 碼到指定位置，最後自己爬上岸。'
WHERE id = '997642b0-c290-48cf-a53f-ccb46d52d539';

-- ---------- 4. L4 階段 3 重新編號 ----------
UPDATE public.skills SET sort_order = 1 WHERE id = 'b4e9ff8e-535c-4e5e-bc9a-8ceb9c252113';  -- 踩水 1 分鐘
UPDATE public.skills SET sort_order = 2 WHERE id = '95bf3bc3-79b3-48a4-9a90-cf53103ca965';  -- 無蛙鏡游泳
UPDATE public.skills SET sort_order = 3 WHERE id = '81568486-d273-49b0-a824-d53569fefc37';  -- 著衣不戴蛙鏡游 7 碼
UPDATE public.skills SET sort_order = 4 WHERE id = 'c2a0c2d4-5e6f-4a82-8b92-0c1d2e3f4a62';  -- 水中自保驗收 25 碼

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L3 應該變成 12 個技能，階段 2 有四個：
-- select l.level_number, s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number in (3,4) and s.is_active
--  order by l.level_number, s.stage, s.sort_order;
