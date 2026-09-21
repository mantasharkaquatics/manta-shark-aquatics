-- ============================================================
-- Manta Shark Aquatics — L7 計時改成時間級距，拿掉年齡與等級字樣
--
-- 業主決定：對外的 /levels、主管的課程地圖、家長看到的任何地方，
-- 都不出現「10 歲」、「B 標」，也不出現四個分開的秒數。
-- 每個距離只留一個時間範圍，不分男女、不分年齡，而且比原本放寬。
--
-- 級距怎麼算的：下限取原本女／男兩個秒數裡慢的那個，往上進到 5 的
-- 倍數；上限是下限的 1.25 倍再往上進到 5 的倍數。
--   50 自由 39.89/38.29 → 40 到 50 秒        100 自由 1:30.89/1:28.49 → 1:35 到 2:00
--   50 仰   48.59/48.49 → 50 秒到 1:05       100 仰   1:45.79/1:41.09 → 1:50 到 2:20
--   50 蛙   54.59/53.49 → 55 秒到 1:10       100 蛙   2:00.29/1:55.49 → 2:05 到 2:40
--   50 蝶   48.39/46.49 → 50 秒到 1:05       100 蝶   1:56.69/1:53.89 → 2:00 到 2:30
-- 出處只留在教練手冊的級別說明裡，別的地方一律只講範圍。
--
-- 八個技能跟著改名：（B 標）→（計時）。中文名字不能跟 L5／L6 的
-- 自由式 50 碼、仰式 50 碼、自由式 100 碼、仰式 100 碼、蛙式 50 碼、
-- 蝶式 50 碼 撞名，所以括號留著，只換裡面的字。
--
-- 前置那份只有註解跟著改，不必重跑。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET name = 'Freestyle 50 yd (Timed)', pass_criteria = 'A legal 50 yd freestyle from a push start, timed between 40 and 50 seconds — faster passes too. 自由式 50 碼動作合規不失格，水中出發計時落在 40 到 50 秒 之間；游得更快一樣算過。'
WHERE id = 'c4b854b3-f337-4799-9631-33c6459951c6';   -- 自由式 50 碼（計時）

UPDATE public.skills SET name = 'Backstroke 50 yd (Timed)', pass_criteria = 'A legal 50 yd backstroke from a push start, timed between 50 seconds and 1:05 — faster passes too. 仰式 50 碼動作合規不失格，水中出發計時落在 50 秒到 1:05 之間；游得更快一樣算過。'
WHERE id = '73baf35a-1541-4d95-ade3-85cacd6dbf34';   -- 仰式 50 碼（計時）

UPDATE public.skills SET name = 'Breaststroke 50 yd (Timed)', pass_criteria = 'A legal 50 yd breaststroke from a push start, timed between 55 seconds and 1:10 — faster passes too. 蛙式 50 碼動作合規不失格，水中出發計時落在 55 秒到 1:10 之間；游得更快一樣算過。'
WHERE id = 'de916eb5-53b3-4ab3-b451-53f793a1666f';   -- 蛙式 50 碼（計時）

UPDATE public.skills SET name = 'Butterfly 50 yd (Timed)', pass_criteria = 'A legal 50 yd butterfly from a push start, timed between 50 seconds and 1:05 — faster passes too. 蝶式 50 碼動作合規不失格，水中出發計時落在 50 秒到 1:05 之間；游得更快一樣算過。'
WHERE id = 'c9047d9f-1b91-4902-a4ce-33e303b4674b';   -- 蝶式 50 碼（計時）

UPDATE public.skills SET name = 'Freestyle 100 yd (Timed)', pass_criteria = 'A legal 100 yd freestyle from a push start, timed between 1:35 and 2:00 — faster passes too. 自由式 100 碼動作合規不失格，水中出發計時落在 1:35 到 2:00 之間；游得更快一樣算過。'
WHERE id = 'c6c39234-8af8-47bb-b1d2-b33537efcf2b';   -- 自由式 100 碼（計時）

UPDATE public.skills SET name = 'Backstroke 100 yd (Timed)', pass_criteria = 'A legal 100 yd backstroke from a push start, timed between 1:50 and 2:20 — faster passes too. 仰式 100 碼動作合規不失格，水中出發計時落在 1:50 到 2:20 之間；游得更快一樣算過。'
WHERE id = 'caf1da5f-3ff5-4d73-b479-6f0336dfdc36';   -- 仰式 100 碼（計時）

UPDATE public.skills SET name = 'Breaststroke 100 yd (Timed)', pass_criteria = 'A legal 100 yd breaststroke from a push start, timed between 2:05 and 2:40 — faster passes too. 蛙式 100 碼動作合規不失格，水中出發計時落在 2:05 到 2:40 之間；游得更快一樣算過。'
WHERE id = '7665ebd2-eb5b-4b00-8ef2-d0ec1039be51';   -- 蛙式 100 碼（計時）

UPDATE public.skills SET name = 'Butterfly 100 yd (Timed)', pass_criteria = 'A legal 100 yd butterfly from a push start, timed between 2:00 and 2:30 — faster passes too. 蝶式 100 碼動作合規不失格，水中出發計時落在 2:00 到 2:30 之間；游得更快一樣算過。'
WHERE id = '5e7e292d-e1b7-48de-a32d-24f698dcaae5';   -- 蝶式 100 碼（計時）

COMMIT;

-- ----------- 跑完的驗證 -----------
-- 應該 0 列（資料庫裡不該再有 B Standard）：
-- select name from skills where is_active and name ilike '%B Standard%';
--
-- 八條標準都應該看得到時間範圍：
-- select s.stage, s.sort_order, s.name, s.pass_criteria
--   from public.skills s join public.levels l on l.id = s.level_id
--  where l.level_number = 7 and s.is_active and s.name like '%(Timed)%'
--  order by s.stage, s.sort_order;
