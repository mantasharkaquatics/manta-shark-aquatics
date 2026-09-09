-- ===========================================================================
--  發票序號：收回外部呼叫權限
--  2026-09-09
--
--  get_next_invoice_seq() 目前對 authenticated 開放，意思是任何登入的家長都能
--  透過 PostgREST 直接呼叫它。呼叫一次就消耗一個號碼，號碼不會回收，所以有人
--  連按就能讓發票號碼憑空跳號。沒有資料外洩，但帳面上會出現解釋不了的斷號。
--
--  發票只由伺服器端的路由開立，那些路由都用 service_role，不受這裡影響。
--
--  只收權限，不動函式本體。可重複執行。
-- ===========================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_next_invoice_seq() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_next_invoice_seq() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_next_invoice_seq() FROM PUBLIC;

GRANT  EXECUTE ON FUNCTION public.get_next_invoice_seq() TO service_role;

COMMENT ON FUNCTION public.get_next_invoice_seq() IS
  '發票流水號。只給 service_role —— 開放給 authenticated 會讓任何登入者空燒號碼。';

COMMIT;

-- ---------------------------------------------------------------------------
--  驗證（COMMIT 之後單獨跑）—— 應該只剩 service_role 一列
-- ---------------------------------------------------------------------------
-- SELECT grantee, privilege_type
--   FROM information_schema.routine_privileges
--  WHERE routine_name = 'get_next_invoice_seq' AND routine_schema = 'public';
