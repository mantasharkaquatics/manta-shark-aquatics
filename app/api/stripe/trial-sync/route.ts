import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireParent } from '@/lib/api-auth'
import { syncTrialBooking } from '@/lib/trial-booking'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// The family's dashboard asks this about each Swim Assessment still awaiting
// payment: when they come back from paying (so it confirms without waiting on
// the webhook), and when the hold runs out (so the slot is released on time).
export async function POST(req: NextRequest) {
  const parentCtx = await requireParent()
  if (!parentCtx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { svc, parent } = parentCtx

  const body = await req.json().catch(() => null)
  const booking_id = body?.booking_id
  if (!booking_id) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: booking } = await svc
    .from('bookings')
    .select('id, parent_id, status, stripe_session_id, class_session_id, pending_expires_at, is_trial')
    .eq('id', booking_id).single()
  if (!booking || booking.parent_id !== parent.id || !booking.is_trial)
    return NextResponse.json({ error: 'Booking not found' }, { status: 403 })

  try {
    const r = await syncTrialBooking(svc, stripe, booking)
    return NextResponse.json(r)
  } catch (e: any) {
    console.error('Trial sync error:', e?.message || e)
    return NextResponse.json({ error: 'Could not check the payment' }, { status: 500 })
  }
}
