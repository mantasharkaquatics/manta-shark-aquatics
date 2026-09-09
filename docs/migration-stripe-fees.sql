-- ===========================================================================
--  STRIPE 手續費 — SCHEMA MIGRATION
--  2026-09-09
--
--  收到 $650，Stripe 抽走約 $19，你實際入帳 $631。那 $19 一直只存在 Stripe
--  Dashboard 裡，網站上看不到，所以「這個月到底淨收多少」永遠要開兩個視窗
--  對照。這份遷移把它搬進來。
--
--  數字不是算出來的，是跟 Stripe 要來的：每一筆收款背後都有一個
--  balance transaction，上面寫著 fee 與 net。自己用費率去乘會錯 ——
--  ACH 有上限、卡片有國際附加費、Terminal 費率不同、促銷期間也不一樣。
--
--  只加，不改，不刪。可重複執行。
-- ===========================================================================

BEGIN;

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS fee_cents       bigint,
  ADD COLUMN IF NOT EXISTS net_cents       bigint,
  ADD COLUMN IF NOT EXISTS fee_currency    text,
  ADD COLUMN IF NOT EXISTS fee_captured_at timestamptz;

COMMENT ON COLUMN public.purchases.fee_cents IS
  'Stripe 從這筆收款抽走的手續費（分），來自 balance transaction，不是用費率推算的。';
COMMENT ON COLUMN public.purchases.net_cents IS
  '這筆收款實際進到 Stripe 餘額的金額（分）= amount_cents - fee_cents。';
COMMENT ON COLUMN public.purchases.fee_captured_at IS
  '抓到手續費的時間。NULL 表示還沒抓到 —— 現金收款永遠是 NULL，
   ACH 則要等到結算後才會有。';

-- 補抓作業要找的就是這些：有 Stripe 交易、但還沒抓到手續費的收款。
-- 任一個識別碼都算：早期的儲值和游泳評估只記了 checkout session，
-- 沒記 payment intent，補抓時會先去 Stripe 換一次。
CREATE INDEX IF NOT EXISTS purchases_fee_pending_idx
  ON public.purchases (paid_at DESC)
  WHERE fee_captured_at IS NULL
    AND (stripe_payment_intent_id IS NOT NULL OR stripe_session_id IS NOT NULL);

COMMIT;

-- ---------------------------------------------------------------------------
--  驗證（COMMIT 之後單獨跑）
-- ---------------------------------------------------------------------------
-- SELECT count(*) FILTER (WHERE fee_captured_at IS NOT NULL) AS 已抓到,
--        count(*) FILTER (WHERE fee_captured_at IS NULL
--                          AND stripe_payment_intent_id IS NOT NULL) AS 待補抓,
--        count(*) FILTER (WHERE stripe_payment_intent_id IS NULL) AS 非 Stripe 收款
--   FROM public.purchases;
