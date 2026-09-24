-- 2026-09-24  贈送點數一年到期（owner ran this in Supabase; all four checks returned true）
--
-- point_ledger.granted_expires_at   每一筆「加進贈送點數」的帳本列記下到期日
-- bookings.points_granted           這堂課用了幾點贈送點數
-- bookings.points_granted_expires_at 那些點數的到期日（取消時照這個日期退回）
-- reason 新增 grant_expired、referral_bonus；既有的理由從資料庫讀出後原樣保留

begin;

alter table public.point_ledger
  add column if not exists granted_expires_at timestamptz;

alter table public.bookings
  add column if not exists points_granted integer not null default 0,
  add column if not exists points_granted_expires_at timestamptz;

alter table public.bookings drop constraint if exists bookings_points_granted_check;
alter table public.bookings add constraint bookings_points_granted_check
  check (points_granted >= 0 and (points_granted = 0 or points_granted <= coalesce(points_charged, 0)));

do $$
declare
  def  text;
  vals text[];
begin
  select pg_get_constraintdef(oid) into def
  from pg_constraint
  where conrelid = 'public.point_ledger'::regclass and conname = 'point_ledger_reason_check';

  select array_agg(distinct m[1]) into vals
  from regexp_matches(def, '''([a-z_]+)''::text', 'g') as m;

  vals := array(select distinct unnest(vals || array['grant_expired', 'referral_bonus']) order by 1);

  alter table public.point_ledger drop constraint point_ledger_reason_check;
  execute format(
    'alter table public.point_ledger add constraint point_ledger_reason_check check (reason = any (%L::text[]))',
    vals);
end $$;

commit;
