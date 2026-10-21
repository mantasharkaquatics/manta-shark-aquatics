-- 2026-10-21  Zelle 收款紀錄（Zelle 當作遠端現金）
--
-- Owner, 2026-10-21: Zelle is cash sent remotely. The site never credits a
-- family from a Zelle by itself. It reads Bank of America's "<name> sent you
-- $<amount>" emails from the company mailbox (Gmail, read-only) and keeps one
-- row per payment here; the desk then sells in POS with "Zelle" as the
-- payment method and must pick one of these rows. A row can pay for several
-- sales (e.g. $585 = an $85 assessment + $500 of points) until its amount is
-- used up, and never for more than the bank received.
--
-- Safe to run more than once. Run it BEFORE deploying the Zelle code.

begin;

-- One row per BofA Zelle email. gmail_message_id is what stops the same email
-- being recorded twice when the sync runs again.
create table if not exists public.zelle_receipts (
  id               uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  payer_name       text not null,
  amount_cents     integer not null check (amount_cents > 0),
  memo             text,
  body_excerpt     text,
  subject          text,
  received_at      timestamptz not null,
  -- Google's own check that the email really came from Bank of America
  -- (DKIM pass for bankofamerica.com, sender on ealerts.bankofamerica.com).
  -- A row that fails it is shown with a warning and can never be used in POS.
  verified         boolean not null default false,
  -- "Not a sale": a personal transfer, a refund to us, a test. Leaves the
  -- to-do count; can be undone.
  dismissed_at     timestamptz,
  dismissed_by     uuid references public.admins(id),
  dismiss_note     text,
  created_at       timestamptz not null default now()
);
create index if not exists zelle_receipts_received_idx on public.zelle_receipts (received_at desc);

-- How much of a receipt each desk sale used.
create table if not exists public.zelle_allocations (
  id                 uuid primary key default gen_random_uuid(),
  receipt_id         uuid not null references public.zelle_receipts(id),
  amount_cents       integer not null check (amount_cents > 0),
  sale_kind          text not null check (sale_kind in ('points', 'trial', 'team', 'sdp')),
  parent_id          uuid references public.parents(id),
  purchase_id        uuid,
  invoice_id         uuid,
  team_membership_id uuid,
  admin_id           uuid references public.admins(id),
  created_at         timestamptz not null default now()
);
create index if not exists zelle_allocations_receipt_idx on public.zelle_allocations (receipt_id);

-- The Gmail connection (refresh token) and the sync's last result. One row.
create table if not exists public.zelle_gmail (
  id            integer primary key default 1 check (id = 1),
  email         text not null,
  refresh_token text not null,
  connected_at  timestamptz not null default now(),
  connected_by  uuid references public.admins(id),
  sync_since    timestamptz not null default now(),
  last_sync_at  timestamptz,
  last_error    text
);

-- Server only. The browser never reads or writes any of this; every screen
-- goes through an admin route with the service role.
alter table public.zelle_receipts    enable row level security;
alter table public.zelle_allocations enable row level security;
alter table public.zelle_gmail       enable row level security;
revoke all on table public.zelle_receipts    from anon, authenticated;
revoke all on table public.zelle_allocations from anon, authenticated;
revoke all on table public.zelle_gmail       from anon, authenticated;

-- Takes part of a receipt for one sale. The row lock makes two desks using
-- the same receipt at once queue up, so together they can never spend more
-- than the bank received.
create or replace function public.zelle_allocate(
  p_receipt uuid, p_cents integer, p_kind text, p_parent uuid, p_admin uuid
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  r     public.zelle_receipts%rowtype;
  used  bigint;
  new_id uuid;
begin
  if p_cents is null or p_cents <= 0 then
    raise exception 'ZELLE_BAD_AMOUNT';
  end if;
  select * into r from public.zelle_receipts where id = p_receipt for update;
  if not found then raise exception 'ZELLE_NOT_FOUND'; end if;
  if not r.verified then raise exception 'ZELLE_UNVERIFIED'; end if;
  if r.dismissed_at is not null then raise exception 'ZELLE_DISMISSED'; end if;
  select coalesce(sum(amount_cents), 0) into used
    from public.zelle_allocations where receipt_id = p_receipt;
  if used + p_cents > r.amount_cents then
    raise exception 'ZELLE_NOT_ENOUGH:%', r.amount_cents - used;
  end if;
  insert into public.zelle_allocations (receipt_id, amount_cents, sale_kind, parent_id, admin_id)
  values (p_receipt, p_cents, p_kind, p_parent, p_admin)
  returning id into new_id;
  return new_id;
end
$$;

revoke all on function public.zelle_allocate(uuid, integer, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.zelle_allocate(uuid, integer, text, uuid, uuid) to service_role;

commit;

-- 檢查：每一列 ok 都應該是 true
select 'tables exist' as item,
       to_regclass('public.zelle_receipts') is not null
   and to_regclass('public.zelle_allocations') is not null
   and to_regclass('public.zelle_gmail') is not null as ok
union all
select 'RLS on (all three)',
       (select bool_and(relrowsecurity) from pg_class
         where oid in ('public.zelle_receipts'::regclass, 'public.zelle_allocations'::regclass, 'public.zelle_gmail'::regclass))
union all
select 'browser cannot read or write',
       not (has_table_privilege('authenticated', 'public.zelle_receipts', 'SELECT')
         or has_table_privilege('authenticated', 'public.zelle_gmail', 'SELECT')
         or has_table_privilege('anon', 'public.zelle_gmail', 'SELECT')
         or has_table_privilege('authenticated', 'public.zelle_allocations', 'INSERT'))
union all
select 'browser cannot call zelle_allocate',
       not has_function_privilege('authenticated', 'public.zelle_allocate(uuid, integer, text, uuid, uuid)', 'EXECUTE')
   and not has_function_privilege('anon', 'public.zelle_allocate(uuid, integer, text, uuid, uuid)', 'EXECUTE')
union all
select 'server can call zelle_allocate',
       has_function_privilege('service_role', 'public.zelle_allocate(uuid, integer, text, uuid, uuid)', 'EXECUTE');
