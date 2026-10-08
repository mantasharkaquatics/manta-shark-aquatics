import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { serviceClient } from '@/lib/api-auth'
import { confirmTrialBooking } from '@/lib/trial-booking'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as Stripe.LatestApiVersion })

/* Where a Swim Assessment payment stands, by its checkout id. Read by the
   page a desk-made payment link returns to (/checkout/success?assessment=1),
   which is often opened on a phone that is not signed in -- so no login, and
   only the checkout id Stripe put in the return address identifies it. It
   answers with the state and the lesson time only, no names.

   Like the dashboard's own check, a paid checkout is confirmed here if the
   webhook has not done it yet (confirmTrialBooking is safe to repeat).
     confirmed -- paid, and the assessment is booked (date, time)
     received  -- paid, but the held time had been released; the school has
                  been told and will arrange a time (nothing to pay again)
     pending   -- paid, still being recorded; ask again shortly
     unpaid    -- the checkout was not paid */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('session_id') || ''
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(id)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const meta = session.metadata || {}
  if (meta.type !== 'trial_lesson' || !meta.booking_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.status !== 'complete' || session.payment_status !== 'paid') return NextResponse.json({ state: 'unpaid' })

  const svc = serviceClient()
  try {
    await confirmTrialBooking(svc, session)
  } catch (e) {
    console.error('trial-status: confirm failed', id, e instanceof Error ? e.message : e)
  }

  const { data: bk } = await svc.from('bookings').select('status, class_session_id').eq('id', meta.booking_id).maybeSingle()
  if (bk?.status === 'confirmed' || bk?.status === 'completed') {
    const { data: cs } = await svc.from('class_sessions').select('session_date, start_time').eq('id', bk.class_session_id).maybeSingle()
    return NextResponse.json({ state: 'confirmed', date: cs?.session_date ?? null, time: cs ? String(cs.start_time).slice(0, 5) : null })
  }
  if (bk?.status === 'cancelled') {
    const { data: rec } = await svc.from('purchases').select('id').eq('stripe_session_id', session.id).limit(1)
    if (rec && rec.length > 0) return NextResponse.json({ state: 'received' })
  }
  return NextResponse.json({ state: 'pending' })
}
