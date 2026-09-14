-- ============================================================
-- Manta Shark Aquatics — 熟練度改成六級，解鎖門檻 70 → 60
--
-- 取代 docs/migration-mastery-bands.sql（那份把值收斂成 0/40/70/100）。
-- 現在的六級是：
--     0    沒教過      （學習地圖上不顯示徽章）
--    20    嘗試中
--    40    需協助
--    60    自己做      ← 下一個技能從這裡解鎖，階段也從這裡前進
--    80    熟練中
--   100    學會了      ← 算通過
--
-- 60 這個數字跟 lib/mastery.ts 的 UNLOCK_VALUE 必須一致。
-- 改的話兩邊要一起改。
--
-- 整份是一個 transaction。可重跑。
-- ============================================================
BEGIN;

SET LOCAL lock_timeout = '5s';

-- ---------- 1. 舊值收斂到六個刻度 ----------
-- 上一版把「自己做」存成 70，六級制裡同一個意思是 60。
-- 其餘的值對到最近的刻度。
UPDATE public.student_skill_progress
   SET progress_percent = CASE
         WHEN progress_percent >= 100 THEN 100
         WHEN progress_percent >=  80 THEN  80
         WHEN progress_percent >=  60 THEN  60   -- 含舊的 70
         WHEN progress_percent >=  40 THEN  40
         WHEN progress_percent >=   1 THEN  20
         ELSE 0
       END
 WHERE progress_percent NOT IN (0, 20, 40, 60, 80, 100);

-- ---------- 2. 升階門檻 ----------
CREATE OR REPLACE FUNCTION public.check_level_upgrade() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_level_id     UUID;
  v_level_number INTEGER;
  v_stage        SMALLINT;
  v_cur_level    INTEGER;
  v_cur_stage    SMALLINT;
  v_total        INTEGER;
  v_done         INTEGER;
  -- 「自己做」。跟 lib/mastery.ts 的 UNLOCK_VALUE 一致。
  c_unlock CONSTANT INTEGER := 60;
BEGIN
  -- 學會了就能往下走，不必先練到最熟。游泳的前後技能是互相幫忙長出來的，
  -- 硬要前一個到 100% 才給下一個，是在拖慢學生。
  IF NEW.progress_percent < c_unlock THEN
    RETURN NEW;
  END IF;

  SELECT sk.level_id, l.level_number, sk.stage
    INTO v_level_id, v_level_number, v_stage
    FROM skills sk JOIN levels l ON l.id = sk.level_id
   WHERE sk.id = NEW.skill_id;

  SELECT current_level, COALESCE(current_stage, 1)
    INTO v_cur_level, v_cur_stage
    FROM students WHERE id = NEW.student_id;

  -- 只有學生正在的那個階段可以推動他前進。教練現在可以記錄整個 Level
  -- 的任何技能，所以這道檢查比以前更重要：先記了後面階段的技能，
  -- 不會讓學生跳級。
  IF v_cur_level IS NULL OR v_cur_level <> v_level_number OR v_cur_stage <> v_stage THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_total
    FROM skills WHERE level_id = v_level_id AND stage = v_stage AND is_active = TRUE;

  SELECT COUNT(*) INTO v_done
    FROM student_skill_progress ssp
    JOIN skills sk ON sk.id = ssp.skill_id
   WHERE ssp.student_id = NEW.student_id
     AND sk.level_id = v_level_id AND sk.stage = v_stage AND sk.is_active = TRUE
     AND ssp.progress_percent >= c_unlock;

  IF v_total = 0 OR v_done < v_total THEN
    RETURN NEW;
  END IF;

  -- 階段自己往前走；升 LEVEL 仍然不會自動發生 —— 那是教練推薦、
  -- 管理員核准，核准的路徑才會設定 current_level 並把學生放回階段 1。
  IF v_stage < 3 THEN
    UPDATE students SET current_stage = v_stage + 1 WHERE id = NEW.student_id;
    INSERT INTO level_upgrades (student_id, from_level, to_level, from_stage, to_stage, upgraded_by)
    VALUES (NEW.student_id, v_cur_level, v_cur_level, v_stage, v_stage + 1, NEW.last_updated_by);
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- ---------- 跑完的驗證 ----------
-- 應該只剩 0 / 20 / 40 / 60 / 80 / 100：
-- select progress_percent, count(*) from student_skill_progress
--  group by 1 order by 1;
