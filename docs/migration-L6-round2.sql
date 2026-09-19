-- ============================================================
-- Manta Shark Aquatics — L6 停用 站姿跳水 與 雙手觸壁轉身
--
-- 改完的 L6（9 個技能）：
--   階段1  自由式 200 碼 · 蝶式 10 碼 · 仰式 100 碼 · 蛙式 15 碼
--   階段2  　　　　　　 · 蝶式 25 碼 · 仰式翻滾轉身 · 蛙式 25 碼
--   階段3  　　　　　　 · 水下海豚腿 ·          · 個人混合式打水（不連線）
--
-- 牽動到的 L7 前置（在前置那份，先跑這份再跑那份）：
--   出發台起跳與仰式出發  少了 站姿跳水 → 只剩 仰式翻滾轉身
--   蛙式 50 碼            少了 雙手觸壁轉身 → 只剩 蛙式 25 碼
--   泳式轉換與轉身        少了 雙手觸壁轉身 → 剩 蝶式 25 碼、蛙式 25 碼、仰式翻滾轉身
--
-- ⚠ 蛙式和蝶式比賽只准雙手同時觸壁的平轉身，那個規則現在整個課程裡沒有人教了
--   （L5 開放式轉身 還在，但它教的是動作不是規則）。排到 L7 時要決定是把
--   「雙手同時觸壁」寫進 蛙式（合規）／蝶式（合規）的標準，還是重建一個技能。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET is_active = false
WHERE id IN ('b6a0c2d4-5e6f-4a76-8b92-0c1d2e3f4a56',   -- 站姿跳水
             'c3a0c2d4-5e6f-4a83-8b92-0c1d2e3f4a63');  -- 雙手觸壁轉身

DELETE FROM public.skill_prerequisites
WHERE requires_id IN ('b6a0c2d4-5e6f-4a76-8b92-0c1d2e3f4a56',
                      'c3a0c2d4-5e6f-4a83-8b92-0c1d2e3f4a63')
   OR skill_id    IN ('b6a0c2d4-5e6f-4a76-8b92-0c1d2e3f4a56',
                      'c3a0c2d4-5e6f-4a83-8b92-0c1d2e3f4a63');

UPDATE public.skills SET stage = 3, sort_order = 2, col_override = 3
WHERE id = 'b7525cfb-5d9b-43b2-9868-393578adf991';   -- 個人混合式打水

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L6 應該是 9 個技能：
-- select s.stage, s.sort_order, s.col_override, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 6 and s.is_active
--  order by s.stage, s.sort_order;
