-- ===========================================================================
--  bookings.pay_with_token
--  Run this BEFORE deploying the payment-choice change. It is additive and
--  has a default, so the code running right now keeps working after it.
--
--  Why the column exists: a cross-family 1-on-2 is paid when the OTHER family
--  confirms, which can be fifteen minutes after the inviting family chose how
--  to pay. Without somewhere to keep that choice, confirm-partner would have
--  to guess, and guessing "token" turns a cancellable lesson into a final one
--  behind the parent's back.
--
--  Where to run it: Supabase dashboard -> SQL Editor. Safe to run twice.
-- ===========================================================================

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS pay_with_token boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.bookings.pay_with_token IS
  'The parent''s payment choice at booking time. Authoritative only while a '
  'partner booking is pending; once settled, token_package_id and '
  'lesson_credit_id are what actually happened.';

-- Existing rows: what they actually used is already recorded, so backfill the
-- flag from it rather than leaving every historic row saying "credit".
UPDATE public.bookings
   SET pay_with_token = true
 WHERE token_package_id IS NOT NULL
   AND pay_with_token = false;

SELECT count(*) FILTER (WHERE pay_with_token) AS token_bookings,
       count(*) FILTER (WHERE NOT pay_with_token) AS credit_bookings
FROM public.bookings;
