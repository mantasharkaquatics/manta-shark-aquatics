-- ============================================================
-- Manta Shark Aquatics — Level 3 兩條通過標準
--
-- 業主決定：
--   自由式打水 25 碼  換氣改成「抬頭換氣」。原本的教學重點寫側轉換氣，
--                     但側轉要到 階段2 的 側邊打水、階段3 的 側轉換氣游
--                     才教，等於階段 1 要求了後面才教的技術。改成抬頭之後
--                     順序是：扶板抬頭（階段1）→ 無浮板抬頭（階段2）
--                     → 側轉（階段3）。
--   水域安全測驗      五個吐泡跳「不能扶牆」，全程不扶牆寫進標準。
--                     練習時扶牆沒問題，測驗不行。
--
-- BBQ打水 的前置（仰式打水 25 碼 → 側邊打水 → BBQ打水）在
-- docs/migration-skill-prerequisites.sql，先跑這份再跑那份。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET
  pass_criteria = 'Kicks 25 yards with a board without stopping or standing up, lifting the head for a breath and putting the face straight back in. 扶板打水 25 碼，中途不停、不站起來；要換氣就抬頭吸一口，馬上把臉放回水裡。'
WHERE id = 'e8fd87dc-4e41-4ea5-adda-d8038881f573';   -- 自由式打水 25 碼

UPDATE public.skills SET
  pass_criteria = 'One unbroken run, never holding the wall: jump into deep water from the deck, submerge and retrieve the toy, five bobs off the wall, hand the toy to the coach, starfish float 30 seconds, freestyle kick 10 yards to the mark, and climb out unaided. 一次做完不中斷、全程不扶牆：從池邊跳進深水、下潛撿起玩具、不扶牆做五個吐泡跳、把玩具交給教練、海星漂 30 秒、自由式打水 10 碼到指定位置，最後自己爬上岸。'
WHERE id = '997642b0-c290-48cf-a53f-ccb46d52d539';   -- 水域安全測驗

COMMIT;
