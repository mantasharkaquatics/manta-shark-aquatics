-- Let a points ledger row find its receipt.
--
-- The invoice email tells the family to "log in to your dashboard to view and
-- download it anytime", and until now the dashboard had nowhere to do that. The
-- statement shows "Top-up +2,000" with no way to reach the receipt for the
-- money behind it -- which matters more here than it did under packages,
-- because points are prepaid cash the family can ask for back.
--
-- There was no join to build it on. point_ledger records stripe_session_id;
-- invoices records stripe_payment_intent_id. The same payment, keyed two
-- different ways, with nothing in common. This gives invoices the session id as
-- well, so the statement row and the receipt are one hop apart.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_session_id text;

CREATE INDEX IF NOT EXISTS invoices_stripe_session_id_idx
  ON public.invoices (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- One-time backfill for invoices written before the column existed. Matched on
-- the same family, the same amount, and issued within ten seconds of the
-- purchase row -- the webhook writes the purchase and then immediately asks for
-- the invoice, so anything outside that window is a different payment. Rows
-- that do not match one single purchase are left alone.
UPDATE public.invoices i
SET stripe_session_id = p.stripe_session_id
FROM public.purchases p
WHERE i.stripe_session_id IS NULL
  AND p.stripe_session_id IS NOT NULL
  AND p.parent_id = i.parent_id
  AND p.amount_cents = round(i.amount * 100)
  AND i.created_at BETWEEN p.created_at - interval '10 seconds'
                       AND p.created_at + interval '10 seconds';

SELECT
  count(*) FILTER (WHERE stripe_session_id IS NOT NULL) AS linked,
  count(*) FILTER (WHERE stripe_session_id IS NULL)     AS unlinked,
  count(*)                                              AS total
FROM public.invoices;
