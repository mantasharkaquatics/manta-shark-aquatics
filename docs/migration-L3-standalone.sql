-- ============================================================
-- Manta Shark Aquatics — Level 3：水域安全測驗獨立出來
--
-- L3 的其他技能業主逐項看過，全部維持原樣。只有「水域安全測驗」
-- 改成獨立的一格：它是關卡，不是鏈條的一環（沒有任何技能靠它），
-- 學習地圖上會排在最下面自成一個區塊，不畫任何線。
--
-- 前置關係留著不動（求生漂浮、踩水 30 秒、深水撿物）：它仍然要等
-- 那三個到「自己做」才解鎖，教練端的說明欄也還看得到。改變的只是
-- 圖上怎麼畫。
--
-- 這個欄位是給以後用的：哪一個技能要獨立，就把它設成 true。目前
-- 只有這一個（L4 的水中自保驗收、L7 的四個合規維持原樣，是業主的
-- 決定）。
--
-- 可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.skills
  ADD COLUMN IF NOT EXISTS is_standalone boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.skills.is_standalone IS
  '真：學習地圖上自成一區、不畫連線。前置關係照常運作。';

UPDATE public.skills SET is_standalone = true
WHERE id = (
  SELECT s.id FROM public.skills s
    JOIN public.levels l ON l.id = s.level_id
   WHERE l.level_number = 3 AND s.name = 'Water Safety Test'
   LIMIT 1
);

COMMIT;

-- ---------- 跑完的驗證 ----------
-- select name, is_standalone from skills where is_standalone;
