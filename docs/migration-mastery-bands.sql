-- ============================================================
-- Manta Shark Aquatics — 熟練度四級 ＋ 解鎖門檻下修
--
-- 做兩件事：
--   1. 升階不再需要「每個技能 100%」，改成「每個技能到自己做得到（70）」
--   2. 把舊的 20/40/60/80 收斂成 0/40/70/100 四個值
--
-- 為什麼是 70：程式和資料庫共用同一個門檻，定義在 lib/mastery.ts 的
-- UNLOCK_VALUE。四個等級存成 0 / 40 / 70 / 100，所以「自己做」＝ 70。
-- 改這個數字的話兩邊要一起改。
--
-- 整份是一個 transaction，任一步失敗就全部不套用。
-- 在 Supabase SQL Editor 貼上整份執行。
-- ============================================================
BEGIN;

-- ---------- 1. 舊值收斂到四個等級 ----------
-- 20 和 40 都是「帶著做」，60 和 80 都是「自己做」。
-- 不做這步其實也能跑（程式讀舊值會對應到正確的等級），
-- 做了是為了資料庫裡只剩四種值，之後看報表不會混亂。
UPDATE public.student_skill_progress
   SET progress_percent = CASE
         WHEN progress_percent >= 100 THEN 100
         WHEN progress_percent >=  60 THEN  70
         WHEN progress_percent >=   1 THEN  40
         ELSE 0
       END
 WHERE progress_percent NOT IN (0, 40, 70, 100);

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
  -- 「自己做得到」。跟 lib/mastery.ts 的 UNLOCK_VALUE 必須一致。
  c_unlock CONSTANT INTEGER := 70;
BEGIN
  -- 以前這裡是 < 100。改成門檻值：學會了就能往下走，
  -- 不必先練到穩定。游泳的前後技能是互相幫忙長出來的，
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

  -- 只有學生正在的那個階段可以推動他前進。現在教練可以記錄
  -- 整個 Level 的任何技能，所以這道檢查比以前更重要：先記了
  -- 後面階段的技能，不會讓學生跳級。
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
  -- 讀到階段 3 的學生就停在那裡，繼續把技能練到「穩定做」。
  IF v_stage < 3 THEN
    UPDATE students SET current_stage = v_stage + 1 WHERE id = NEW.student_id;
    INSERT INTO level_upgrades (student_id, from_level, to_level, from_stage, to_stage, upgraded_by)
    VALUES (NEW.student_id, v_cur_level, v_cur_level, v_stage, v_stage + 1, NEW.last_updated_by);
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;

-- ---------- 跑完的驗證（COMMIT 之後再跑） ----------
-- 應該只剩四種值：
-- select progress_percent, count(*) from student_skill_progress
--  group by 1 order by 1;
--
-- 已經達到「自己做」但還沒「穩定做」的技能數（這些就是以前被卡住的）：
-- select count(*) from student_skill_progress where progress_percent = 70;
