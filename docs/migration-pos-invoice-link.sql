-- Let a front-desk points / programme-rate sale's points line find its receipt
-- (found 2026-10-07).
--
-- The invoice email for a desk sale told the family to download the receipt
-- from the dashboard, but the points statement finds a receipt only through
-- invoices.stripe_session_id, and desk sales never set it (they have no
-- checkout session; a cash sale has no Stripe id at all). From 2026-10-07 the
-- desk routes (pos/complete-sale, pos/complete-sdp-sale) write
-- stripe_session_id = 'pos:<purchase id>', and app/api/parent/wallet looks
-- that key up from the ledger row's pricing.purchaseId. Desk CARD sales from
-- before that are also found by their payment intent, with no data change.
--
-- This one-time backfill gives the older desk sales the same key, cash ones
-- included. Data only, no schema change; the code works without it. It only
-- helps sales whose points line records its purchase (pricing.purchaseId,
-- written since 2026-10-05): a desk cash sale older than that still cannot be
-- reached from the statement, key or not. Before launch there are few such
-- sales; the receipt itself is unchanged and the desk can still open it. Matched on the same
-- family and amount, the purchase recorded by staff, and the invoice written
-- within 60 seconds after it (the routes write the purchase and then the
-- invoice). Assessment and team invoices are left out, and an invoice that
-- matches more than one purchase (or a purchase that matches more than one
-- invoice) is left alone.

-- 1. Pre-check: what would be linked.
WITH cand AS (
  SELECT i.id AS invoice_id, p.id AS purchase_id
  FROM public.invoices i
  JOIN public.purchases p
    ON p.parent_id = i.parent_id
   AND p.recorded_by IS NOT NULL
   AND p.amount_cents = round(i.amount * 100)
   AND i.created_at BETWEEN p.created_at AND p.created_at + interval '60 seconds'
  WHERE i.stripe_session_id IS NULL
    AND i.lesson_credit_id IS NULL
    AND i.team_membership_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.lesson_credits lc WHERE lc.purchase_id = p.id AND lc.is_trial)
),
single AS (
  SELECT c.* FROM cand c
  WHERE (SELECT count(*) FROM cand x WHERE x.invoice_id = c.invoice_id) = 1
    AND (SELECT count(*) FROM cand x WHERE x.purchase_id = c.purchase_id) = 1
)
SELECT count(*) AS will_link FROM single;

-- 2. The change.
WITH cand AS (
  SELECT i.id AS invoice_id, p.id AS purchase_id
  FROM public.invoices i
  JOIN public.purchases p
    ON p.parent_id = i.parent_id
   AND p.recorded_by IS NOT NULL
   AND p.amount_cents = round(i.amount * 100)
   AND i.created_at BETWEEN p.created_at AND p.created_at + interval '60 seconds'
  WHERE i.stripe_session_id IS NULL
    AND i.lesson_credit_id IS NULL
    AND i.team_membership_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.lesson_credits lc WHERE lc.purchase_id = p.id AND lc.is_trial)
),
single AS (
  SELECT c.* FROM cand c
  WHERE (SELECT count(*) FROM cand x WHERE x.invoice_id = c.invoice_id) = 1
    AND (SELECT count(*) FROM cand x WHERE x.purchase_id = c.purchase_id) = 1
)
UPDATE public.invoices i
SET stripe_session_id = 'pos:' || s.purchase_id
FROM single s
WHERE i.id = s.invoice_id
  AND i.stripe_session_id IS NULL;

-- 3. Verification: desk purchases with and without a linked receipt.
SELECT
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.invoices i WHERE i.stripe_session_id = 'pos:' || p.id)) AS desk_sales_linked,
  count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.stripe_session_id = 'pos:' || p.id)) AS desk_sales_unlinked
FROM public.purchases p
WHERE p.recorded_by IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.lesson_credits lc WHERE lc.purchase_id = p.id AND lc.is_trial);
