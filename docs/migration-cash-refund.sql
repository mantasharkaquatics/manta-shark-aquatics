-- ===========================================================================
--  現金退款 — SCHEMA MIGRATION
--  2026-09-08
--
--  點數是預收現金，所以一定要有退回去的路。這份遷移加的是那條路需要的兩樣
--  東西：一個「退款送不出去」的帳本理由，和每筆收款各自退了多少的紀錄。
--
--  為什麼需要後者：Stripe 的退款只能退回原本的付款方式，不能指定別的地方。
--  所以退 $650 不是一個動作，而是「把哪幾筆收款、各退多少」——一筆 $400
--  加一筆 $250，或一筆 Stripe 加一筆櫃檯現金。purchases.refunded_cents
--  就是那個分配結果，也是「這筆收款還能退多少」的唯一依據。
--
--  只加，不改，不刪。可重複執行。
--  跑之前：Supabase → Database → Backups 先備份。
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
--  1. 帳本多一個理由：退款送不出去
--
--  退款是「先扣點，再送錢」。順序是刻意的：反過來的話，送錢成功而扣點失敗
--  會讓家長同時拿到錢和點數，而且沒有任何地方看得出來。先扣點的最壞情況是
--  「點扣了、錢沒送成」，帳面上看得見，也補得回來 —— 補回來走的就是這個理由。
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
  'refund_failed',   -- 現金送不出去，把扣掉的點還回去
  'payment_failed',  -- 銀行扣款失敗，沖銷已發出的點數
  'chargeback'       -- 家長向銀行申訴，沖銷已發出的點數
));

-- ---------------------------------------------------------------------------
--  2. 每筆收款退了多少
--
--  可退金額 = amount_cents - refunded_cents，而且 reversed_at 是 null
--  （已經被銀行收回去的錢，不能再退一次）。
-- ---------------------------------------------------------------------------
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS refunded_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_refunded_within_amount;
ALTER TABLE public.purchases ADD  CONSTRAINT purchases_refunded_within_amount
  CHECK (refunded_cents >= 0 AND refunded_cents <= amount_cents);

COMMENT ON COLUMN public.purchases.refunded_cents IS
  '這筆收款已經退回去多少（分）。可退餘額 = amount_cents - refunded_cents。';

COMMIT;

-- ---------------------------------------------------------------------------
--  驗證（COMMIT 之後單獨跑）
-- ---------------------------------------------------------------------------
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.point_ledger'::regclass AND conname = 'point_ledger_reason_check';
--
-- SELECT count(*) FROM public.purchases WHERE refunded_cents <> 0;   -- 應該 0
