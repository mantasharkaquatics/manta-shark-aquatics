-- ============================================================
-- Manta Shark Aquatics — 流線自由式打水 改成 10 碼
--
-- 標準原本寫 25 碼，業主改成 10 碼。名字不加距離。
-- 這樣它跟 水下自由式打水（水面下一口氣 10 碼）是同一個距離，
-- 差別只在一個在水面、一個在水面下。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET
  pass_criteria = 'Kicks 10 yd in a tight streamline, both arms overhead, face down. 流線型雙手過頭夾緊，臉朝下打水 10 碼。'
WHERE id = '818b6b3b-63b9-4e13-9a52-f3f466f57cc7';   -- 流線自由式打水

COMMIT;
