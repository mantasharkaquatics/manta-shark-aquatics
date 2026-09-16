-- ============================================================
-- Manta Shark Aquatics — Level 4 第一輪改版
--
-- 業主決定：
--   自由式 25 碼   階段1 → 階段2，排在 自由式 15 碼 正下方
--   初級仰泳 25 碼 階段2 → 階段3，排在 仰式 15 碼 正下方；中文改叫「仰泳 25 碼」
--   停用           無蛙鏡游泳、著衣不戴蛙鏡游 7 碼、水中自保驗收 25 碼
--
-- 改完的樣子：
--   階段1  自由式 15 碼、坐姿與跪姿入水
--   階段2  自由式 25 碼、仰式 15 碼、流線自由式打水、水下自由式打水
--   階段3  仰泳 25 碼、踩水 1 分鐘
--
-- 中文名不在資料庫裡（skills.name 是英文，中文走 db-strings.json），
-- 所以「初級仰泳 → 仰泳」不需要 SQL。英文仍是 Elementary Backstroke 25 yd。
--
-- 停用牽動到的前置（在 docs/migration-skill-prerequisites.sql，先跑這份再跑那份）：
--   L6 著衣不戴蛙鏡游 25 碼  少了 著衣不戴蛙鏡游 7 碼 → 只剩 踩水 2 分鐘
--   L5 仰式 25 碼            前置換成 仰泳 25 碼（同一個技能，只是改了中文名）
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 停用 ----------
UPDATE public.skills SET is_active = false
WHERE id IN ('95bf3bc3-79b3-48a4-9a90-cf53103ca965',   -- 無蛙鏡游泳
             '81568486-d273-49b0-a824-d53569fefc37',   -- 著衣不戴蛙鏡游 7 碼
             'c2a0c2d4-5e6f-4a82-8b92-0c1d2e3f4a62');  -- 水中自保驗收 25 碼

DELETE FROM public.skill_prerequisites
WHERE requires_id IN ('95bf3bc3-79b3-48a4-9a90-cf53103ca965',
                      '81568486-d273-49b0-a824-d53569fefc37',
                      'c2a0c2d4-5e6f-4a82-8b92-0c1d2e3f4a62')
   OR skill_id    IN ('95bf3bc3-79b3-48a4-9a90-cf53103ca965',
                      '81568486-d273-49b0-a824-d53569fefc37',
                      'c2a0c2d4-5e6f-4a82-8b92-0c1d2e3f4a62');

-- ---------- 2. 階段與順序 ----------
UPDATE public.skills SET stage = 1, sort_order = 1 WHERE id = 'dff814b2-90df-4043-aeb3-dd4e4df64fbe';  -- 自由式 15 碼
UPDATE public.skills SET stage = 1, sort_order = 2 WHERE id = 'b3a0c2d4-5e6f-4a73-8b92-0c1d2e3f4a53';  -- 坐姿與跪姿入水

UPDATE public.skills SET stage = 2, sort_order = 1 WHERE id = '91e61121-5528-456b-9e7d-b97953ed0c39';  -- 自由式 25 碼
UPDATE public.skills SET stage = 2, sort_order = 2 WHERE id = '96c47b53-df33-4b4a-9a8e-a84eed10c7b8';  -- 仰式 15 碼
UPDATE public.skills SET stage = 2, sort_order = 3 WHERE id = '818b6b3b-63b9-4e13-9a52-f3f466f57cc7';  -- 流線自由式打水
UPDATE public.skills SET stage = 2, sort_order = 4 WHERE id = '9722f505-b208-43dc-868d-495ba0f3c10e';  -- 水下自由式打水

UPDATE public.skills SET stage = 3, sort_order = 1 WHERE id = 'c1a0c2d4-5e6f-4a81-8b92-0c1d2e3f4a61';  -- 仰泳 25 碼
UPDATE public.skills SET stage = 3, sort_order = 2 WHERE id = 'b4e9ff8e-535c-4e5e-bc9a-8ceb9c252113';  -- 踩水 1 分鐘

COMMIT;

-- ----------- 跑完的驗證 -----------
-- L4 應該剩 8 個技能：
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 4 and s.is_active
--  order by s.stage, s.sort_order;
