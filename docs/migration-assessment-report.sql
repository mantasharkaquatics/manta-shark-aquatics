-- 2026-09-30  評估報告＋評估費折抵
--
-- student_assessments   每位學生一列（評估一人只做一次）：
--   報告內容   主管確認評估時選的建議課程、每週次數、一句說明（和它的翻譯）
--   折抵進度   評估日起 60 天內，用購買點數上滿 8 堂 → 送 85 點贈送點數
--              credit_status: pending（進行中）→ awarded（已送）或 expired（過期沒上滿）
-- point_ledger.reason   新增 assessment_credit（點數紀錄顯示「評估費折抵」）
-- 只由伺服器（service role）讀寫：開啟 RLS、不給任何 policy。
-- 重複執行安全。

begin;

create table if not exists public.student_assessments (
  id                       uuid primary key default gen_random_uuid(),
  student_id               uuid not null unique references public.students(id) on delete cascade,
  parent_id                uuid not null references public.parents(id) on delete cascade,
  booking_id               uuid references public.bookings(id) on delete set null,
  progress_history_id      uuid,
  lesson_note_id           uuid,
  assessed_on              date not null,
  level_number             integer not null,

  recommended_course       text not null check (recommended_course in ('1on1', '1on2', '1on4', 'team')),
  weekly_frequency         text not null check (weekly_frequency in ('1', '1-2', '2', '2-3', '3')),
  recommendation_note      text,
  recommendation_note_i18n jsonb not null default '{}'::jsonb,

  confirmed_by             uuid,
  confirmed_at             timestamptz not null default now(),
  emailed_at               timestamptz,

  credit_deadline          date not null,
  credit_status            text not null default 'pending' check (credit_status in ('pending', 'awarded', 'expired')),
  credit_awarded_at        timestamptz,
  credit_ledger_id         uuid references public.point_ledger(id) on delete set null,

  created_at               timestamptz not null default now()
);

create index if not exists student_assessments_parent_idx  on public.student_assessments (parent_id);
create index if not exists student_assessments_pending_idx on public.student_assessments (credit_deadline) where credit_status = 'pending';

alter table public.student_assessments enable row level security;

-- 帳本理由加上 assessment_credit；既有的理由從資料庫讀出後原樣保留
do $$
declare
  def  text;
  vals text[];
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.point_ledger'::regclass and conname = 'point_ledger_reason_check';

  -- 約束的寫法有兩種：reason IN ('a','b') 會顯示成 'a'::text, 'b'::text；
  -- 上一次遷移改寫後的 reason = any ('{a,b}'::text[]) 是陣列寫法。兩種都讀，
  -- 再加上帳本裡實際用過的理由，保證沒有任何一列會被新約束擋掉。
  select array_agg(distinct v order by v) into vals from (
    select m[1] as v from regexp_matches(def, '''([a-z_]+)''::text', 'g') as m
    union
    select btrim(unnest(string_to_array(m[1], ','))) from regexp_matches(def, '''\{([^}]*)\}''', 'g') as m
    union
    select distinct reason from public.point_ledger
    union
    select 'assessment_credit'
  ) x;

  -- 讀不到既有理由就停下來，不要換上一個只剩新理由的約束
  if not (vals @> array['purchase', 'booking', 'admin_grant', 'referral_bonus', 'grant_expired']) then
    raise exception '讀不到既有的帳本理由，已停止：%', def;
  end if;

  alter table public.point_ledger drop constraint point_ledger_reason_check;
  execute format(
    'alter table public.point_ledger add constraint point_ledger_reason_check check (reason = any (%L::text[]))',
    vals);
end $$;

commit;

-- 檢查：應該是 4 列，每一列 ok 都是 true
select 'student_assessments 表' as item, to_regclass('public.student_assessments') is not null as ok
union all
select 'student_assessments RLS 開啟', (select relrowsecurity from pg_class where oid = 'public.student_assessments'::regclass)
union all
select '帳本理由有 assessment_credit',
       (select pg_get_constraintdef(oid) like '%assessment_credit%' from pg_constraint
        where conrelid = 'public.point_ledger'::regclass and conname = 'point_ledger_reason_check')
union all
select '帳本理由保留 referral_bonus',
       (select pg_get_constraintdef(oid) like '%referral_bonus%' from pg_constraint
        where conrelid = 'public.point_ledger'::regclass and conname = 'point_ledger_reason_check');
