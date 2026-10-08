-- ===========================================================================
--  家長只讀得到「已核准」的上課報告（audit #63）
--  2026-10-08
--
--  家長首頁是從瀏覽器直接查 progress_history 和 lesson_notes。「只看已核准」
--  原本只寫在網頁程式裡（.eq('status','approved')），repo 裡沒有任何一條
--  progress_history 的資料庫規則看得出有限制 status。若家長那條 SELECT 規則
--  只寫「自己孩子的資料」，家長在瀏覽器主控台拿掉那個條件，就讀得到教練剛送出、
--  主管還沒審的分數，和主管寫給教練的退回原因（sent_back_reason）。
--
--  這支加上兩道「限制型（RESTRICTIVE）」規則：瀏覽器端（anon / authenticated）
--  讀 progress_history 和 lesson_notes 時，一律只能拿到 status = 'approved'
--  的列。限制型規則會跟現有的規則「同時」成立，所以不用知道現有規則叫什麼、
--  也不會放寬任何東西。
--
--  不受影響的：教練頁、主管頁、審核、月報等，全部是在伺服器用 service role
--  讀寫（service role 不受 RLS 限制）。2026-10-08 查過：瀏覽器端讀這兩張表
--  的只有家長首頁，而它本來就只要已核准的。
--
--  另外把 progress_history 的退回欄位（sent_back_reason / sent_back_at /
--  sent_back_by）從瀏覽器端拿掉：報告退回後重新送出、核准，這幾欄會保留
--  （migration-report-sendback.sql），所以「已核准」的列上也可能帶著主管寫給
--  教練的話。做法是把 SELECT 權限改成逐欄授權（除了這三欄以外的全部欄位）。
--  家長首頁只讀 student_id, session_date, snapshot, lesson_key,
--  class_session_id，不受影響。
--  注意：之後若 progress_history 新增欄位、又要讓家長從瀏覽器讀，要記得
--  GRANT SELECT (新欄位) 給 authenticated。
--
--  可重複執行。
-- ===========================================================================

BEGIN;

ALTER TABLE public.progress_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fix5_browser_reads_approved_only ON public.progress_history;
CREATE POLICY fix5_browser_reads_approved_only ON public.progress_history
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

DROP POLICY IF EXISTS fix5_browser_reads_approved_only ON public.lesson_notes;
CREATE POLICY fix5_browser_reads_approved_only ON public.lesson_notes
  AS RESTRICTIVE
  FOR SELECT
  TO anon, authenticated
  USING (status = 'approved');

-- 退回欄位：表層級的 SELECT 換成「除了這三欄以外」的逐欄 SELECT。
-- 只有在這三欄存在時才做（沒跑過 migration-report-sendback.sql 就略過）。
DO $$
DECLARE
  cols text;
  r text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'progress_history'
      AND column_name IN ('sent_back_reason', 'sent_back_at', 'sent_back_by')
  ) THEN
    RAISE NOTICE 'progress_history has no sent_back_* columns; column grants left as they are';
    RETURN;
  END IF;

  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'progress_history'
    AND column_name NOT IN ('sent_back_reason', 'sent_back_at', 'sent_back_by');

  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    EXECUTE format('REVOKE SELECT ON public.progress_history FROM %I', r);
    EXECUTE format('GRANT SELECT (%s) ON public.progress_history TO %I', cols, r);
  END LOOP;
END $$;

COMMIT;

-- 驗證：應該看到兩條 fix5_browser_reads_approved_only（permissive 欄 = RESTRICTIVE），
-- 以及 authenticated 對 sent_back_* 三欄「沒有」SELECT 權限（has_select = false）。
SELECT tablename, policyname, permissive, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('progress_history', 'lesson_notes', 'lesson_note_translations')
ORDER BY tablename, policyname;

SELECT column_name,
       has_column_privilege('authenticated', 'public.progress_history', column_name, 'SELECT') AS has_select
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'progress_history'
ORDER BY ordinal_position;
