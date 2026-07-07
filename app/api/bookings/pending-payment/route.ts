import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireParent } from '@/lib/api-auth'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// Parent actions on a pending_payment (trial) booking:
//  - link:   return the live Stripe Checkout URL so the parent can resume payment
//  - cancel: expire the Stripe session FIRST (kills any open payment page, so
//            payment can never complete after this point), then conditional
//            update pending_payment -> cancelled as the idempotency lock.
//            The webhook expired handler then no-ops (status already changed).
export async function POST(req: NextRequest) {
  const parentCtx = await requireParent()
  if (!parentCtx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = parentCtx

  const body = await req.json().catch(() => null)
  const action = body?.action
  const booking_id = body?.booking_id
  if (!booking_id || (action !== 'link' && action !== 'cancel'))
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: booking } = await svc
    .from('bookings')
    .select('id, parent_id, status, stripe_session_id, class_session_id')
    .eq('id', booking_id).single()
  if (!booking || booking.parent_id !== parent.id)
    return NextResponse.json({ error: 'Booking not found' }, { status: 403 })
  if (booking.status !== 'pending_payment')
    return NextResponse.json({ error: 'This booking is not awaiting payment. Please refresh the page.' }, { status: 409 })
  if (!booking.stripe_session_id)
    return NextResponse.json({ error: 'No payment link is attached to this booking. It will be released automatically if unpaid.' }, { status: 409 })

  if (action === 'link') {
    const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id)
    if (session.status === 'open' && session.url)
      return NextResponse.json({ url: session.url })
    if (session.status === 'complete')
      return NextResponse.json({ error: 'Payment already completed. Please refresh the page.' }, { status: 409 })
    return NextResponse.json({ error: 'The payment link has expired. The slot will be released shortly.' }, { status: 409 })
  }

  // action === 'cancel'
  try {
    await stripe.checkout.sessions.expire(booking.stripe_session_id)
  } catch {
    const session = await stripe.checkout.sessions.retrieve(booking.stripe_session_id).catch(() => null)
    if (session?.status === 'complete')
      return NextResponse.json({ error: 'Payment already completed - this booking is confirmed. Please refresh the page.' }, { status: 409 })
    // already expired -> safe to continue cleanup
  }

  const { data: locked } = await svc
    .from('bookings')
    .update({ status: 'cancelled', cancellation_reason: 'cancelled_before_payment' })
    .eq('id', booking.id).eq('status', 'pending_payment')
    .select('id')
  if (!locked || locked.length === 0)
    return NextResponse.json({ error: 'Booking state changed. Please refresh the page.' }, { status: 409 })

  // Close the session if it became empty (trigger already recounted enrolled_count).
  const { data: sess } = await svc
    .from('class_sessions').select('enrolled_count').eq('id', booking.class_session_id).single()
  if (sess && sess.enrolled_count === 0) {
    await svc.from('class_sessions')
      .update({ status: 'cancelled' })
      .eq('id', booking.class_session_id).eq('enrolled_count', 0)
  }

  return NextResponse.json({ ok: true })
}
