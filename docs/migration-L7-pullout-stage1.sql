-- ============================================================
-- Manta Shark Aquatics — 蛙式水下划手 搬到 L7 階段1
--
-- 這一項是蛙式的「出發」（pullout / 大蛙）：入水之後整套水下划手要做完
-- 才破水，破水之後才開始蛙式。它是出發和每一次轉身都會用到的東西，
-- 不是游完之後才補的技術，所以從階段3 提到階段1。
--
-- 位置：第五欄，泳式轉換與轉身 的正上方，兩個連線
-- （會了出發的水下划手，才談得上四式銜接與轉身）。
--
-- 改完的 L7（13 個技能），五欄：自由式 · 仰式 · 蛙式 · 蝶式 · 出發與銜接
--   階段1  自由式 50 碼（B 標）· 仰式 50 碼（B 標）· 蛙式 50 碼（B 標）· 蝶式 50 碼（B 標）· 蛙式水下划手
--   階段2  自由式 100 碼（B 標）· 仰式 100 碼（B 標）· 蛙式 100 碼（B 標）· 蝶式 100 碼（B 標）· 泳式轉換與轉身
--   階段3  自由式 500 碼 · 仰式 200 碼 ·      ·      · 個人混合式 100 碼
--
-- 前置跟著改（在前置那份）：
--   蛙式水下划手   蛙式 100 碼（B 標）→ 蛙式 25 碼（L6）
--                  原本掛在 100 碼底下，現在它在 100 碼上面，不改會變成倒掛
--   泳式轉換與轉身 蝶式 25 碼 + 蛙式 25 碼 + 仰式翻滾轉身
--                  → 蝶式 25 碼 + 仰式翻滾轉身 + 蛙式水下划手
--                  （蛙式 25 碼 拿掉是因為 蛙式水下划手 本來就要它，不必掛兩次）
--
-- 通過標準也重寫了，講清楚這是出發：docs/coaching-content.json 和
-- lib/i18n/locales/db-strings.json 一起改。
--
-- 前置在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET
  stage = 1, sort_order = 5, col_override = 4,
  pass_criteria = 'Off the start: one pull-down — full pull to the thighs, one dolphin kick, recovery — the head staying under until the breakout, breaststroke starting only after it. 出發入水之後完成一次水下划手：長划到大腿、一次海豚腿、收手，破水前頭不出水面，破水之後才開始蛙式。'
WHERE id = 'fb34523b-58c7-4e1f-9cef-a56ebea37757';   -- 蛙式水下划手

UPDATE public.skills SET stage = 3, sort_order = 3, col_override = 4
WHERE id = 'e9f7b834-3e50-446f-a775-33d547ba776b';   -- 個人混合式 100 碼（階段3 少一個，順序補上）

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L7 應該是 13 個技能，階段 1/2/3 各 5/5/3：
-- select s.stage, s.sort_order, s.col_override, s.name
--   from public.skills s join public.levels l on l.id = s.level_id
--  where l.level_number = 7 and s.is_active
--  order by s.stage, s.sort_order;
