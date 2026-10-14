-- ===========================================================================
--  點數餘額不足提醒 low-balance reminder — 2026-10-14
--
--  point_wallets 加一欄：這個家庭這一次掉到門檻以下時，提醒信是什麼時候寄的。
--  有值 = 已經提醒過，不再寄；家長儲值回到門檻以上，排程會把它清掉。
--
--  只加欄位，不改既有資料。可重複執行。
-- ===========================================================================

alter table public.point_wallets
  add column if not exists low_balance_notified_at timestamptz;

comment on column public.point_wallets.low_balance_notified_at is
  '點數不足提醒信寄出的時間（lib/low-balance.ts）。NULL = 這一次還沒提醒。';

-- 檢查：應該是 true
select '欄位 low_balance_notified_at' as item,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'point_wallets'
                 and column_name = 'low_balance_notified_at') as ok;
