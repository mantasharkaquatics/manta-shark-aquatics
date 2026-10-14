-- ===========================================================================
--  生日卡片 birthday cards — 2026-10-14
--
--  1. birthday_cards：每位學員每年一列。(student_id, year) 唯一，所以排程
--     跑兩次也只會寄一次、送一次點數。
--  2. 帳本多一個理由 birthday_gift（生日禮物，贈送點數）。
--
--  只加，不改既有資料。可重複執行。
-- ===========================================================================

create table if not exists public.birthday_cards (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  student_id    uuid not null references public.students(id) on delete cascade,
  parent_id     uuid not null references public.parents(id) on delete cascade,
  year          integer not null,
  kind          text not null check (kind in ('active', 'returning', 'adult')),
  points        integer not null default 0,
  ledger_id     uuid,                      -- 生日禮物那一行 point_ledger
  status        text not null default 'pending' check (status in ('pending', 'sent', 'email_failed')),
  sent_at       timestamptz,
  email_to      text,
  error         text,
  unique (student_id, year)
);
create index if not exists birthday_cards_year on public.birthday_cards (year, created_at desc);

-- 平台慣例：開 RLS、不給 policy，只有伺服器讀寫。
alter table public.birthday_cards enable row level security;

-- 帳本理由：讀出目前約束裡的所有理由，再加上 birthday_gift（跟 assessment_credit 那次同一種寫法）。
begin;
do $$
declare def text; vals text[];
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
  where conrelid = 'public.point_ledger'::regclass and conname = 'point_ledger_reason_check';

  select array_agg(distinct v order by v) into vals from (
    select m[1] as v from regexp_matches(def, '''([a-z_]+)''::text', 'g') as m
    union
    select btrim(unnest(string_to_array(m[1], ','))) from regexp_matches(def, '''\{([^}]*)\}''', 'g') as m
    union
    select distinct reason from public.point_ledger
    union
    select 'birthday_gift'
  ) x;

  if not (vals @> array['purchase', 'booking', 'admin_grant', 'referral_bonus', 'grant_expired', 'assessment_credit']) then
    raise exception '讀不到既有的帳本理由，已停止：%', def;
  end if;

  alter table public.point_ledger drop constraint point_ledger_reason_check;
  execute format(
    'alter table public.point_ledger add constraint point_ledger_reason_check check (reason = any (%L::text[]))',
    vals);
end $$;
commit;

-- 檢查：三列都應該是 true
select 'birthday_cards 表' as item, to_regclass('public.birthday_cards') is not null as ok
union all
select 'birthday_cards RLS 開啟', (select relrowsecurity from pg_class where oid = 'public.birthday_cards'::regclass)
union all
select '帳本理由有 birthday_gift',
       (select pg_get_constraintdef(oid) like '%birthday_gift%' from pg_constraint
        where conrelid = 'public.point_ledger'::regclass and conname = 'point_ledger_reason_check');
