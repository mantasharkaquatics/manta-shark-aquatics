-- ===========================================================================
--  教練介面語言
--  2026-09-10
--
--  教練有讀中文的也有讀英文的，但教練 App 整個是英文寫死的。這支 migration
--  只做一件事：給 coaches 一個欄位記住他選的介面語言。
--
--  為什麼不重用 default_note_language：那是「這則語音紀錄要用什麼語言講」，
--  講給家長聽的；介面語言是「我自己看什麼語言」。同一個教練可能用中文錄給
--  中文家庭、但介面想留英文，反過來也一樣。混成一個欄位，之後一定要拆。
--
--  不過第一次設定值時拿它當預設是合理的 —— 教練錄音講中文，介面多半也看中文，
--  這樣沒有人需要把同一件事設定兩次。
--
--  可重複執行。跑之前：Supabase → Database → Backups 先備份。
-- ===========================================================================

BEGIN;

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS ui_language text NOT NULL DEFAULT 'en';

-- 只收這兩個值。教練端不提供簡體 —— 家長端的三語不受影響。
ALTER TABLE public.coaches
  DROP CONSTRAINT IF EXISTS coaches_ui_language_check;
ALTER TABLE public.coaches
  ADD CONSTRAINT coaches_ui_language_check
  CHECK (ui_language IN ('en', 'zh-Hant'));

COMMENT ON COLUMN public.coaches.ui_language IS
  '教練 App 的介面語言（en / zh-Hant）。與 default_note_language 分開：
   那個是語音紀錄講給家長聽的語言，這個是教練自己看的語言。';

-- 既有教練沿用他錄音的語言，省得同一件事設定兩次。只在還沒有人動過
-- ui_language 的時候套用，所以重跑不會蓋掉教練自己改過的選擇。
UPDATE public.coaches
   SET ui_language = 'zh-Hant'
 WHERE ui_language = 'en'
   AND default_note_language = 'zh-Hant';

COMMIT;

-- ---------------------------------------------------------------------------
--  驗證（COMMIT 之後單獨跑）
-- ---------------------------------------------------------------------------
-- SELECT first_name, last_name, default_note_language, ui_language
--   FROM public.coaches WHERE is_active ORDER BY first_name;
