-- 2026-10-01  補課券（docs/fixed-class-spec.md 第二、三節）
--
-- make_up_vouchers   一張補課券 = 一堂同種類的課，不扣點
--   course_slug / minutes   只能補同一種課：1on1（30 或 60 分）、1on2、1on4
--   student_id              一對一、一對四：屬於這個孩子
--   student2_id             同家庭一對二：兩個孩子都在券上
--   reason                  leave（提前 24 小時請假）、grace（每月寬限）、
--                           admin（櫃台發的）、end_of_term（櫃台結束固定班）
--   grace_month             用寬限換的券才有：那個月的 1 號（洛杉磯時間）。
--                           每個孩子每個月只能有一張 —— 由下面的唯一索引擋住，
--                           同時按兩次也不會用掉兩次寬限
--   status                  active → used（訂了補課）／expired（過期）／void（櫃台作廢）
--   expires_on              缺課那天 + 28 天
--   source_booking_id       是哪一堂課換來的；一堂課只能換一張（唯一索引）
--   used_booking_id         用這張券訂的那堂補課
-- bookings.voucher_id       這堂課是用哪張券訂的（補課）；一般的課是 null
-- 只由伺服器（service role）讀寫：開啟 RLS、不給任何 policy。
-- 重複執行安全。

begin;

create table if not exists public.make_up_vouchers (
  id                 uuid primary key default gen_random_uuid(),
  parent_id          uuid not null references public.parents(id) on delete cascade,
  student_id         uuid not null references public.students(id) on delete cascade,
  student2_id        uuid references public.students(id) on delete cascade,
  course_slug        text not null check (course_slug in ('1on1', '1on2', '1on4')),
  minutes            int  not null check (minutes in (30, 60)),
  reason             text not null check (reason in ('leave', 'grace', 'admin', 'end_of_term')),
  grace_month        date check (grace_month is null or extract(day from grace_month) = 1),
  status             text not null default 'active' check (status in ('active', 'used', 'expired', 'void')),
  expires_on         date not null,
  source_booking_id  uuid references public.bookings(id) on delete set null,
  fixed_class_id     uuid references public.fixed_classes(id) on delete set null,
  used_booking_id    uuid references public.bookings(id) on delete set null,
  used_at            timestamptz,
  reminded_at        timestamptz,
  created_by         uuid,
  voided_by          uuid,
  voided_at          timestamptz,
  void_reason        text,
  note               text,
  created_at         timestamptz not null default now(),
  check (reason <> 'grace' or grace_month is not null)
);

create index if not exists make_up_vouchers_parent_idx on public.make_up_vouchers (parent_id, status, expires_on);
create index if not exists make_up_vouchers_expiry_idx on public.make_up_vouchers (status, expires_on);
create unique index if not exists make_up_vouchers_one_grace_a_month
  on public.make_up_vouchers (student_id, grace_month) where grace_month is not null;
create unique index if not exists make_up_vouchers_one_per_lesson
  on public.make_up_vouchers (source_booking_id) where source_booking_id is not null;

alter table public.make_up_vouchers enable row level security;

alter table public.bookings
  add column if not exists voucher_id uuid references public.make_up_vouchers(id) on delete set null;
create index if not exists bookings_voucher_idx on public.bookings (voucher_id) where voucher_id is not null;

commit;

notify pgrst, 'reload schema';

-- 檢查：應該是 4 列，每一列 ok 都是 true
select 'make_up_vouchers 表' as item, to_regclass('public.make_up_vouchers') is not null as ok
union all
select 'make_up_vouchers RLS 開啟', (select relrowsecurity from pg_class where oid = 'public.make_up_vouchers'::regclass)
union all
select '每個孩子每月一次寬限', to_regclass('public.make_up_vouchers_one_grace_a_month') is not null
union all
select 'bookings.voucher_id 欄位',
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'bookings' and column_name = 'voucher_id');
