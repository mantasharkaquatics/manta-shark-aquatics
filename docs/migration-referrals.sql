-- 2026-09-24  介紹優惠（lib/referrals.ts）
--
-- parents.referral_code   每個家庭的介紹代碼，第一次打開點數卡時才產生
-- referrals               誰介紹了誰；每個新家庭只能出現一次（referred_parent_id unique）
--   status: pending（等第一堂付費課）→ awarded（兩邊各送 40 點）；void 留給人工作廢
-- 只由伺服器（service role）讀寫：開啟 RLS、不給任何 policy。

begin;

alter table public.parents
  add column if not exists referral_code text;

create unique index if not exists parents_referral_code_key
  on public.parents (referral_code) where referral_code is not null;

create table if not exists public.referrals (
  id                    uuid primary key default gen_random_uuid(),
  referrer_parent_id    uuid not null references public.parents(id) on delete cascade,
  referred_parent_id    uuid not null unique references public.parents(id) on delete cascade,
  code                  text not null,
  status                text not null default 'pending' check (status in ('pending', 'awarded', 'void')),
  qualifying_booking_id uuid references public.bookings(id) on delete set null,
  awarded_at            timestamptz,
  created_at            timestamptz not null default now(),
  check (referrer_parent_id <> referred_parent_id)
);

create index if not exists referrals_referrer_idx on public.referrals (referrer_parent_id);
create index if not exists referrals_pending_idx  on public.referrals (status) where status = 'pending';

alter table public.referrals enable row level security;

commit;

-- 檢查：應該是 3 列，每一列 ok 都是 true
select 'parents.referral_code' as item,
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'parents' and column_name = 'referral_code') as ok
union all
select 'referrals 表', to_regclass('public.referrals') is not null
union all
select 'referrals RLS 開啟', (select relrowsecurity from pg_class where oid = 'public.referrals'::regclass);
