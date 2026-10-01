-- 2026-10-01  固定班（docs/fixed-class-spec.md）
--
-- fixed_classes     一個固定班 = 一個孩子（同家庭一對二是兩個孩子）、同一個星期幾、
--                   同一個時間、同一種課與長度、同一位教練
--   weekday         0 = 星期日 … 6 = 星期六（洛杉磯時間）
--   status          active（上課中）→ ended（上完、或櫃台結束整期）
-- bookings.fixed_class_id   這堂課屬於哪個固定班；單堂是 null
-- 只由伺服器（service role）讀寫：開啟 RLS、不給任何 policy。
-- 重複執行安全。

begin;

create table if not exists public.fixed_classes (
  id              uuid primary key default gen_random_uuid(),
  parent_id       uuid not null references public.parents(id) on delete cascade,
  student_id      uuid not null references public.students(id) on delete cascade,
  student2_id     uuid references public.students(id) on delete cascade,
  course_type_id  uuid not null references public.course_types(id),
  minutes         int  not null check (minutes in (30, 60)),
  coach_id        uuid not null references public.coaches(id),
  weekday         smallint not null check (weekday between 0 and 6),
  start_time      time not null,
  status          text not null default 'active' check (status in ('active', 'ended')),
  ended_at        timestamptz,
  ended_by        uuid,
  ended_reason    text,
  created_at      timestamptz not null default now()
);

create index if not exists fixed_classes_parent_idx  on public.fixed_classes (parent_id, status);
create index if not exists fixed_classes_student_idx on public.fixed_classes (student_id, status);
create index if not exists fixed_classes_slot_idx    on public.fixed_classes (coach_id, weekday, start_time) where status = 'active';

alter table public.fixed_classes enable row level security;

alter table public.bookings
  add column if not exists fixed_class_id uuid references public.fixed_classes(id) on delete set null;
create index if not exists bookings_fixed_class_idx on public.bookings (fixed_class_id) where fixed_class_id is not null;

commit;

notify pgrst, 'reload schema';

-- 檢查：應該是 3 列，每一列 ok 都是 true
select 'fixed_classes 表' as item, to_regclass('public.fixed_classes') is not null as ok
union all
select 'fixed_classes RLS 開啟', (select relrowsecurity from pg_class where oid = 'public.fixed_classes'::regclass)
union all
select 'bookings.fixed_class_id 欄位',
       exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'bookings' and column_name = 'fixed_class_id');
