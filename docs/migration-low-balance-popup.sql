-- ===========================================================================
--  點數不足的小視窗 low-balance pop-up — 2026-10-15
--
--  point_wallets 加一欄：這一次點數不足時，首頁的小視窗什麼時候跳過。
--  有值 = 已經跳過，不再跳（換手機、換電腦也一樣）；點數回到足夠後清掉。
--
--  只加欄位，不改既有資料。可重複執行。請在推程式之前執行。
-- ===========================================================================

alter table public.point_wallets
  add column if not exists low_balance_popup_at timestamptz;

comment on column public.point_wallets.low_balance_popup_at is
  '點數不足小視窗顯示的時間（lib/low-balance.ts）。NULL = 這一次還沒跳。';

-- 檢查：應該是 true
select '欄位 low_balance_popup_at' as item,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'point_wallets'
                 and column_name = 'low_balance_popup_at') as ok;
