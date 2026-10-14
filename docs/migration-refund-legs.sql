-- ===========================================================================
--  退款明細 refund_legs — 2026-10-14
--
--  一次退款會拆成好幾段（leg）：每段是一筆原始收款退多少。
--    - kind 'stripe'    ：Stripe 退回原卡 / 原銀行帳戶。
--                         status pending → succeeded，或 failed（銀行帳戶的
--                         退款要幾天，可能事後失敗；失敗時網站把點數加回去）。
--    - kind 'hand_back' ：當初在櫃檯付現金的部分，要有人拿現金還給家長。
--                         status to_hand_back → handed_back（按「已交付」）。
--
--  「待交還現金」清單讀的就是 kind='hand_back' AND status='to_hand_back'。
--  只加新表，不改既有資料。可重複執行。
-- ===========================================================================

create table if not exists public.refund_legs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  parent_id        uuid not null references public.parents(id) on delete cascade,
  ledger_id        uuid not null,           -- 那次退款在 point_ledger 的 cash_refund 那一行
  purchase_id      uuid not null references public.purchases(id),
  amount_cents     bigint not null check (amount_cents > 0),
  kind             text not null check (kind in ('stripe', 'hand_back')),
  status           text not null check (status in ('pending', 'succeeded', 'failed', 'to_hand_back', 'handed_back')),
  stripe_refund_id text unique,
  failure_reason   text,
  note             text,                    -- 退款原因（家長對帳單上看到的那段）
  created_by       text,                    -- admin:<id>
  handed_at        timestamptz,
  handed_by        text                     -- admin:<id>
);

create index if not exists refund_legs_open_hand_back
  on public.refund_legs (created_at) where kind = 'hand_back' and status = 'to_hand_back';
create index if not exists refund_legs_parent on public.refund_legs (parent_id, created_at desc);

-- 平台慣例：開 RLS、不給任何 policy，只有伺服器（service role）能讀寫。
alter table public.refund_legs enable row level security;

-- 驗證（要看到：refund_legs | true | 0）
select c.relname, c.relrowsecurity, count(p.polname) as policies
from pg_class c left join pg_policy p on p.polrelid = c.oid
where c.relname = 'refund_legs' group by 1, 2;
