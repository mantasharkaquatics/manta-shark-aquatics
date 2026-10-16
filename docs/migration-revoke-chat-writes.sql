-- 2026-10-16  收回瀏覽器對聊天資料表（chat_threads / chat_messages）的寫入權限（稽核 F39）
--
-- RUN THIS ONLY AFTER THE CODE FROM AUDIT BATCH 6 IS DEPLOYED.
-- Before batch 6 the parent chat widget and Admin > Messages wrote both tables
-- from the browser; after this file runs, that old code is refused
-- ("permission denied for table ..."), so a tab still open on the old version
-- must be reloaded.
--
-- Why: a signed-in family could, from the browser console, insert a message
-- with sender_type 'admin' (it shows in Admin > Messages as a desk reply) and
-- rewrite its thread's escalation_summary, mode and ai_context_from, which
-- staff and the AI trust. Since batch 6 every write goes through a server
-- route with the service role (app/api/chat/send, app/api/chat/thread,
-- app/api/admin/chat-message, app/api/admin/chat-thread, ...), which these
-- privileges do not touch.
--
-- SELECT is NOT revoked: the widget, the admin inbox and its badge read both
-- tables from the browser, under the existing RLS policies.
--
-- Safe to run more than once.

begin;

revoke insert, update, delete on table public.chat_threads  from anon, authenticated;
revoke insert, update, delete on table public.chat_messages from anon, authenticated;

do $$
declare r record;
begin
  for r in
    select c.relname, a.attname
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('chat_threads', 'chat_messages')
      and a.attnum > 0 and not a.attisdropped
  loop
    execute format('revoke insert (%I), update (%I) on table public.%I from anon, authenticated',
                   r.attname, r.attname, r.relname);
  end loop;
end $$;

commit;

-- 檢查：每一列 ok 都應該是 true
select t.tbl || ': ' || r.role || ' cannot write' as item,
       not (has_table_privilege(r.role, 'public.' || t.tbl, 'INSERT')
         or has_table_privilege(r.role, 'public.' || t.tbl, 'UPDATE')
         or has_table_privilege(r.role, 'public.' || t.tbl, 'DELETE')
         or has_any_column_privilege(r.role, 'public.' || t.tbl, 'INSERT')
         or has_any_column_privilege(r.role, 'public.' || t.tbl, 'UPDATE')) as ok
from (values ('chat_threads'), ('chat_messages')) t(tbl)
cross join (values ('anon'), ('authenticated')) r(role)
union all
select t.tbl || ': authenticated can still READ', has_table_privilege('authenticated', 'public.' || t.tbl, 'SELECT')
from (values ('chat_threads'), ('chat_messages')) t(tbl)
union all
select t.tbl || ': service_role (server) can still write',
       has_table_privilege('service_role', 'public.' || t.tbl, 'INSERT')
   and has_table_privilege('service_role', 'public.' || t.tbl, 'UPDATE')
   and has_table_privilege('service_role', 'public.' || t.tbl, 'DELETE')
from (values ('chat_threads'), ('chat_messages')) t(tbl);
