-- One live Swim Team subscription per swimmer (owner, 2026-10-06).
--
-- The webhook already refuses a second subscription it can see. This index is
-- what decides when two payments arrive at the same moment: the second insert
-- fails with 23505, and the webhook cancels and refunds that subscription.
--
-- Run step 1 first. If it returns any rows, those swimmers already have two
-- live subscriptions: cancel the extra one in Stripe (and mark its row
-- 'cancelled') before step 2, or step 2 will fail.

-- 1. Swimmers with more than one live subscription today (expect no rows).
select student_id, count(*) as live_subscriptions, array_agg(stripe_subscription_id) as subscriptions
from public.team_memberships
where stripe_subscription_id is not null
  and status in ('active', 'past_due')
group by student_id
having count(*) > 1;

-- 2. The rule itself.
create unique index if not exists team_memberships_one_live_subscription
  on public.team_memberships (student_id)
  where stripe_subscription_id is not null and status in ('active', 'past_due');

-- 3. Check: should return one row, team_memberships_one_live_subscription.
select indexname from pg_indexes
where schemaname = 'public' and indexname = 'team_memberships_one_live_subscription';
