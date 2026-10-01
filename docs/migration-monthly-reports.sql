-- 2026-09-30  每月 AI 月報（lib/monthly-reports.ts）
--
-- monthly_reports   每位學生每個月一份（student_id + month 唯一）
--   month           該月 1 號
--   status          draft（AI 寫好、等主管）→ approved（主管核准）→ sent（已寄出、家長看得到）
--   data            產生當下凍結的數字：上課紀錄、階段進度、技能變化、教練評語的 id
--                   —— 之後就算資料變動，已寄出的月報內容不會跟著變
--   summary/focus   AI 寫的英文本文與「下個月的重點」，主管可修改
--   *_i18n          核准時翻成 en / zh-Hant / zh-Hans
--   feedback        家長的 👍（up）/ 👎（down）與選填留言，只有主管在後台看得到
-- 只由伺服器（service role）讀寫：開啟 RLS、不給任何 policy。
-- 重複執行安全。

begin;

create table if not exists public.monthly_reports (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students(id) on delete cascade,
  parent_id         uuid not null references public.parents(id) on delete cascade,
  month             date not null check (extract(day from month) = 1),
  status            text not null default 'draft' check (status in ('draft', 'approved', 'sent')),

  data              jsonb not null default '{}'::jsonb,
  summary           text not null default '',
  focus             text not null default '',
  summary_i18n      jsonb not null default '{}'::jsonb,
  focus_i18n        jsonb not null default '{}'::jsonb,

  generated_at      timestamptz not null default now(),
  edited_by         uuid,
  edited_at         timestamptz,
  approved_by       uuid,
  approved_at       timestamptz,
  sent_at           timestamptz,
  emailed_at        timestamptz,

  feedback          text check (feedback in ('up', 'down')),
  feedback_comment  text check (feedback_comment is null or char_length(feedback_comment) <= 1000),
  feedback_at       timestamptz,

  created_at        timestamptz not null default now(),
  unique (student_id, month)
);

create index if not exists monthly_reports_month_idx  on public.monthly_reports (month, status);
create index if not exists monthly_reports_parent_idx on public.monthly_reports (parent_id, month desc);

alter table public.monthly_reports enable row level security;

commit;

notify pgrst, 'reload schema';

-- 檢查：應該是 3 列，每一列 ok 都是 true
select 'monthly_reports 表' as item, to_regclass('public.monthly_reports') is not null as ok
union all
select 'monthly_reports RLS 開啟', (select relrowsecurity from pg_class where oid = 'public.monthly_reports'::regclass)
union all
select '每位學生每月唯一',
       exists (select 1 from pg_constraint
               where conrelid = 'public.monthly_reports'::regclass and contype = 'u');
