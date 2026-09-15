-- ============================================================
-- Manta Shark Aquatics — L1–L3 檢查後的修正
--
-- 改名
--   抓握池壁   → 沿壁移動      （標準早就是「沿著池壁換手移動 5 碼」，
--                                名字還停在「抓住」）
--   水面吐泡泡 → 水面嘴巴吐泡泡（跟階段3 的水中鼻子吐泡泡成對，
--                                一眼看得出差別在嘴巴還是鼻子）
--
-- 改標準
--   自由式打水 25 碼   拿掉「並側轉換氣」——換氣是階段3 側轉換氣游的事，
--                      寫在這裡等於要求學生先會後面才過得了前面。
--   吐泡跳（過頭深）   原本寫「同上，但…」，指的是清單上剛好排在它前面
--                      的那一個。順序一改就指錯人，改成完整的一句話。
--
-- 新增
--   跳入胸深水（L2 階段3）。L3 的水域安全測驗要求「跳入水中」，但整個
--   L1–L3 沒有任何一個技能教過入水，驗收就成了考沒教過的東西。
--
-- 前置補上（都是漏掉的因果，不是新規定）
--   憋氣 5 秒     ← 水中鼻子吐泡泡   （鼻子會吐氣才憋得住）
--   水母漂        ← 面部入水漂浮
--   BBQ身體旋轉   ← 自由式打水 10 碼（浮板）（旋轉是在打水中做的）
--   求生漂浮      ← 水母漂
--   水域安全測驗  ← 跳入胸深水
--   跳入胸深水    ← 安全進出泳池、吐泡跳（胸深）
--   水面嘴巴吐泡泡 的前置拿掉：對著水面吹泡泡第一天就能做，
--                  不必等會走。
--
-- 這份跑完要再跑 docs/migration-skill-prerequisites.sql。
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.skills SET name = 'Wall Traverse'
WHERE id = 'a5ec094e-4338-4259-9e43-4b913cd02ca3';   -- 抓握池壁 → 沿壁移動

UPDATE public.skills SET name = 'Mouth Bubbles at the Surface'
WHERE id = '0d151d1b-8492-49bc-824e-c4e26a657046';   -- 水面吐泡泡 → 水面嘴巴吐泡泡

UPDATE public.skills SET
  pass_criteria = 'Kicks 25 yards holding a board without stopping or standing up. 扶板打水 25 碼，中途不停、不站起來。'
WHERE id = 'e8fd87dc-4e41-4ea5-adda-d8038881f573';

UPDATE public.skills SET
  pass_criteria = 'Ten in a row in water over their head, holding the wall: down, breathe out, up, in rhythm. 過頭深的水中扶牆連續十次：下沉、吐氣、浮起，有節奏不中斷。'
WHERE id = 'c7022acb-3075-471f-8c45-4d5330139369';

INSERT INTO public.skills (id, level_id, name, stage, sort_order, is_active, pass_criteria)
SELECT '63f1fc23-f60a-4417-86e1-2d4dd2d191c3', l.id, 'Jump into Chest-Deep Water', 3, 5, true,
       'Jumps in feet-first from the edge into chest-deep water, surfaces and gets to the wall or stands up unaided. 從池邊雙腳跳進胸深水，自己浮起來抓到池壁或站起來，不需要人接。'
  FROM public.levels l WHERE l.level_number = 2
ON CONFLICT (id) DO UPDATE SET level_id = EXCLUDED.level_id, name = EXCLUDED.name,
  stage = EXCLUDED.stage, sort_order = EXCLUDED.sort_order, is_active = true,
  pass_criteria = EXCLUDED.pass_criteria;

COMMIT;

-- ---------- 跑完的驗證 ----------
-- select s.stage, s.sort_order, s.name
--   from skills s join levels l on l.id = s.level_id
--  where l.level_number = 2 and s.is_active order by s.stage, s.sort_order;
