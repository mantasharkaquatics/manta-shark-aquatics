-- ===========================================================================
--  櫃檯補入點數 — 防止重複入點
--  2026-10-05
--
--  背景：櫃檯賣點數（/api/pos/complete-sale、complete-sdp-sale）是先記
--  purchases，再分兩筆入點：購買的點數、贈送的點數。其中一筆失敗時，
--  畫面會出現「補入點數」按鈕（/api/pos/retry-credit），用同一張 purchase
--  把沒進去的那筆補上——購買的點數仍然是「購買」，不會變成會過期的贈點。
--
--  兩筆帳本記錄的 pricing 都帶著 purchaseId：
--    {"kind": "pos_purchase", "purchaseId": "..."}   購買的點數
--    {"kind": "pos_bonus",    "purchaseId": "..."}   贈送的點數
--  補入之前程式會先查有沒有，但兩個人同時按，兩邊都可能查到「沒有」。
--  這個唯一索引讓第二筆寫不進去，程式收到 DuplicateLedgerEntry 就當成已完成。
--
--  只「加」索引，不改任何資料。可重複執行。不跑也能用，只是少了這道保險。
--
--  跑的地方：Supabase → SQL Editor，整份貼上執行。
-- ===========================================================================

CREATE UNIQUE INDEX IF NOT EXISTS point_ledger_pos_credit_uniq
  ON public.point_ledger ((pricing->>'kind'), (pricing->>'purchaseId'))
  WHERE pricing->>'kind' IN ('pos_purchase', 'pos_bonus');

-- 檢查：應該回傳 1 列
-- SELECT indexname FROM pg_indexes
--  WHERE tablename = 'point_ledger' AND indexname = 'point_ledger_pos_credit_uniq';
