-- ===========================================================================
--  上課報告「退回給教練」
--  2026-10-08
--
--  審核頁的待審上課報告可以退回給教練，附一句原因（業主決定）。退回的報告
--  不會寫進 student_skill_progress、家長看不到；那堂課回到教練「學習進度」頁
--  的待辦清單，看得到原因，教練重新送出後再回到審核頁。
--
--  progress_history 加三欄記住退回原因、時間和哪位主管退回的。
--  progress_history / lesson_notes 的 status 若有 CHECK 限制而且還不收
--  'rejected'，就把 'rejected' 加進去（其他允許的值保持不變）。
--
--  可重複執行。在這支跑之前就部署也沒關係：退回照樣能用，只是原因存不下來
--  （審核頁會提示）；若 status 限制擋下 'rejected'，退回按鈕會說需要先跑這支。
-- ===========================================================================

BEGIN;

ALTER TABLE public.progress_history
  ADD COLUMN IF NOT EXISTS sent_back_reason text,
  ADD COLUMN IF NOT EXISTS sent_back_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_back_by uuid;

COMMENT ON COLUMN public.progress_history.sent_back_reason IS
  '主管退回這份報告給教練時寫的原因（status = rejected）。教練重新送出後保留，供參考。';

-- Widen any status CHECK that does not allow 'rejected' yet, keeping every
-- value it already allows. Postgres stores IN (...) as = ANY (ARRAY[...]).
DO $$
DECLARE
  r record;
  def text;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid IN ('public.progress_history'::regclass, 'public.lesson_notes'::regclass)
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%''rejected''%'
  LOOP
    IF position('ARRAY[' IN r.def) > 0 THEN
      def := replace(r.def, 'ARRAY[', 'ARRAY[''rejected''::text, ');
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I %s', r.tbl, r.conname, def);
      RAISE NOTICE 'widened % on %: %', r.conname, r.tbl, def;
    ELSE
      RAISE NOTICE 'left % on % as it is (not an IN list): %', r.conname, r.tbl, r.def;
    END IF;
  END LOOP;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
--  驗證（單獨跑）：三個新欄位都在；status 限制（若有）都含 'rejected'
-- ---------------------------------------------------------------------------
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'progress_history'
--    AND column_name IN ('sent_back_reason', 'sent_back_at', 'sent_back_by');
-- SELECT conrelid::regclass, conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE contype = 'c' AND conrelid IN ('public.progress_history'::regclass, 'public.lesson_notes'::regclass);
