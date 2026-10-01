-- 2026-09-30  意見箱（家長首頁「有建議想告訴我們？」）
--
-- parent_suggestions   家長隨時可以寫的建議，選填、不匿名；只有主管在後台看得到
--   status  new（還沒看）→ done（已處理）
-- 只由伺服器（service role）讀寫：開啟 RLS、不給任何 policy。
-- 重複執行安全。

begin;

create table if not exists public.parent_suggestions (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid not null references public.parents(id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 2000),
  status      text not null default 'new' check (status in ('new', 'done')),
  handled_by  uuid,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists parent_suggestions_status_idx on public.parent_suggestions (status, created_at desc);

alter table public.parent_suggestions enable row level security;

commit;

notify pgrst, 'reload schema';

-- 檢查：應該是 2 列，ok 都是 true
select 'parent_suggestions 表' as item, to_regclass('public.parent_suggestions') is not null as ok
union all
select 'parent_suggestions RLS 開啟', (select relrowsecurity from pg_class where oid = 'public.parent_suggestions'::regclass);
