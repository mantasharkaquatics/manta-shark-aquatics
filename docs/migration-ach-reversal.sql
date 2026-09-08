-- ===========================================================================
--  ACH 沖銷 — SCHEMA MIGRATION
--  2026-09-08
--
--  背景：銀行扣款（ACH Direct Debit）不是保證付款。家長在結帳頁按下確認後，
--  Stripe 要 2~4 個工作天才知道錢有沒有真的到。我們選擇「當下就給點數」——
--  客戶不能等——代價是必須有一條把點數收回來的路。
--
--  兩種收不到錢的情況：
--    payment_failed  銀行退回（餘額不足、帳號錯誤、帳戶已關閉）
--    chargeback      家長主動向銀行申訴（個人帳戶 60 天內，且不可申訴翻案）
--
--  這份遷移只「加」和「放寬」，不刪任何東西。可重複執行。
--
--  跑之前：Supabase → Database → Backups 先備份。
--  跑的地方：Supabase → SQL Editor，整份貼上執行。
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
--  1. 帳本多兩個理由
-- ---------------------------------------------------------------------------
ALTER TABLE public.point_ledger DROP CONSTRAINT IF EXISTS point_ledger_reason_check;
ALTER TABLE public.point_ledger ADD  CONSTRAINT point_ledger_reason_check CHECK (reason IN (
  'purchase',        -- 家長買點數
  'booking',         -- 訂課扣點
  'booking_failed',  -- 訂課途中失敗，把扣掉的點還回去
  'cancel_refund',   -- 24 小時前取消，退點
  'forgiveness',     -- 24 小時內取消，用掉一次豁免退點
  'school_cancel',   -- 校方取消，退點
  'admin_grant',     -- 主管贈點
  'admin_deduct',    -- 主管扣點
  'cash_refund',     -- 退現金，點數扣掉
  'payment_failed',  -- 銀行扣款失敗，沖銷已發出的點數
  'chargeback'       -- 家長向銀行申訴，沖銷已發出的點數
));

-- 一筆結帳最多只沖銷一次。payment_failed 和 chargeback 共用這個索引：
-- 同一筆錢不會既被退回又被申訴，真的兩個事件都來，第二個會撞上這裡，
-- 程式端收到 DuplicateLedgerEntry 就當成「已處理」回 200。
CREATE UNIQUE INDEX IF NOT EXISTS point_ledger_reversal_uniq
  ON public.point_ledger (stripe_session_id)
  WHERE reason IN ('payment_failed', 'chargeback') AND stripe_session_id IS NOT NULL;

-- ---------------------------------------------------------------------------
--  2. 錢包可以是負的
--
--  沖銷發生時，家長可能已經把點數花掉了。硬把餘額壓在 0 會讓「帳本各筆
--  變動加總 = 餘額」這個不變式破掉，而那個不變式是整套點數系統唯一能自我
--  稽核的東西。所以讓 balance_purchased 可以為負 —— 負數就是欠款，
--  訂課入口會擋下來，家長補款後自然回到正數。
--
--  balance_granted 維持不可為負：贈點是我們送的，不會變成債務。
-- ---------------------------------------------------------------------------
ALTER TABLE public.point_wallets DROP CONSTRAINT IF EXISTS point_wallets_balance_purchased_check;

COMMENT ON COLUMN public.point_wallets.balance_purchased IS
  '購買而來的點數餘額。可為負：銀行扣款失敗或遭申訴沖銷後，尚未補回的欠款。';

-- ---------------------------------------------------------------------------
--  3. purchases 記下被沖銷這件事
--
--  不動 status 欄位（它的 CHECK 是舊制留下的，改它風險大於好處），
--  改用兩個新欄位。Sales 頁之後可以直接讀。
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS reversed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

CREATE INDEX IF NOT EXISTS purchases_payment_intent_idx
  ON public.purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

COMMIT;

-- ---------------------------------------------------------------------------
--  驗證（COMMIT 之後單獨跑）
-- ---------------------------------------------------------------------------
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conrelid = 'public.point_ledger'::regclass AND conname LIKE '%reason%';
--
-- SELECT indexname FROM pg_indexes
--  WHERE tablename = 'point_ledger' AND indexname = 'point_ledger_reversal_uniq';
--
-- SELECT conname FROM pg_constraint
--  WHERE conrelid = 'public.point_wallets'::regclass
--    AND conname = 'point_wallets_balance_purchased_check';   -- 應該 0 列
