-- ===========================================================================
--  主管後台介面語言
--  2026-10-02
--
--  後台原本整個是英文寫死的。跟教練端（coaches.ui_language）同一個做法：
--  給 admins 一個欄位記住主管自己選的介面語言，換電腦、換瀏覽器都一樣。
--  只收 en / zh-Hant —— 後台不提供簡體，家長端的三語不受影響。
--
--  可重複執行。在這支跑之前就部署也沒關係：後台讀不到這欄時會用英文。
-- ===========================================================================

BEGIN;

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS ui_language text NOT NULL DEFAULT 'en';

ALTER TABLE public.admins
  DROP CONSTRAINT IF EXISTS admins_ui_language_check;
ALTER TABLE public.admins
  ADD CONSTRAINT admins_ui_language_check
  CHECK (ui_language IN ('en', 'zh-Hant'));

COMMENT ON COLUMN public.admins.ui_language IS
  '主管後台的介面語言（en / zh-Hant）。';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
--  驗證（單獨跑）
-- ---------------------------------------------------------------------------
-- SELECT first_name, last_name, ui_language FROM public.admins;
