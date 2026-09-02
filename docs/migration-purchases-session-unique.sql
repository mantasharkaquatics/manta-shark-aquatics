-- One Stripe checkout session, one purchases row.
--
-- The old package code recorded a purchase against stripe_payment_intent_id,
-- which carries a UNIQUE constraint (purchases_stripe_payment_intent_id_key).
-- The points webhook records stripe_session_id instead, and that column had no
-- constraint at all. The protection against a repeated delivery was never a
-- line of code, so nothing in the conversion looked like it was being removed
-- -- it was a database constraint, and it simply stopped applying.
--
-- What made it visible was the deployed site sitting in Stripe's test-mode
-- endpoint list, so every test checkout was delivered twice. That endpoint is
-- gone. This is the constraint that should have been there anyway.
--
-- Partial, because a front-desk POS sale records a purchase with no Stripe
-- session at all, and several of those may legitimately have NULL.
--
-- Run this AFTER the duplicate rows are gone; it will refuse to build over
-- them, which is the correct failure.

CREATE UNIQUE INDEX IF NOT EXISTS purchases_stripe_session_id_key
  ON public.purchases (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

-- Proof it took, and that nothing is duplicated behind it.
SELECT
  (SELECT count(*) FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'purchases_stripe_session_id_key') AS index_built,
  (SELECT count(*) FROM (
     SELECT stripe_session_id FROM public.purchases
     WHERE stripe_session_id IS NOT NULL
     GROUP BY stripe_session_id HAVING count(*) > 1
   ) d) AS duplicate_sessions_remaining;
