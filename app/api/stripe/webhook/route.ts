import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Webhook signature error:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const meta = session.metadata!

    if (meta.type === 'trial_lesson') {
      const booking_id = meta.booking_id
      const student_id = meta.student_id

      const { error: bookingErr } = await supabase
        .from('bookings')
        .update({ status: 'confirmed' })
        .eq('id', booking_id)

      if (bookingErr) {
        console.error('Trial booking confirm error:', bookingErr)
        return NextResponse.json({ error: 'Trial booking confirm failed' }, { status: 500 })
      }

      const { error: studentErr } = await supabase
        .from('students')
        .update({ trial_used_at: new Date().toISOString() })
        .eq('id', student_id)

      if (studentErr) {
        console.error('Trial student update error:', studentErr)
      }

      console.log(`✅ Trial lesson confirmed: booking ${booking_id} for student ${student_id}`)
      return NextResponse.json({ received: true })
    }

    const parent_id      = meta.parent_id
    const plan_id        = meta.plan_id
    const sessions       = parseInt(meta.sessions)
    const course_type_id = meta.course_type_id
    const amount_cents   = session.amount_total!

    // 1. Create purchase record
    const { data: purchase, error: purchaseErr } = await supabase
      .from('purchases')
      .insert({
        parent_id,
        lesson_package_id: null,
        amount_cents,
        status: 'paid',
        stripe_session_id: session.id,
        paid_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (purchaseErr || !purchase) {
      console.error('Purchase insert error:', purchaseErr)
      return NextResponse.json({ error: 'Purchase failed' }, { status: 500 })
    }

    // 2. Create lesson_credits
    const expiresAt = new Date()
    expiresAt.setFullYear(expiresAt.getFullYear() + 1)

    const { error: creditErr } = await supabase
      .from('lesson_credits')
      .insert({
        student_id: null,
        parent_id,
        purchase_id: purchase.id,
        course_type_id,
        total_credits: sessions,
        used_credits: 0,
        expires_at: expiresAt.toISOString(),
      })

    if (creditErr) {
      console.error('Credit insert error:', creditErr)
      return NextResponse.json({ error: 'Credit failed' }, { status: 500 })
    }

    console.log(`✅ Purchase complete: ${plan_id} for parent ${parent_id}`)
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session
    const meta = session.metadata!

    if (meta.type === 'trial_lesson') {
      const booking_id = meta.booking_id
      const class_session_id = meta.class_session_id

      const { data: booking } = await supabase
        .from('bookings')
        .select('status')
        .eq('id', booking_id)
        .single()

      if (booking?.status === 'pending_payment') {
        await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('id', booking_id)

        const { data: sess } = await supabase
          .from('class_sessions')
          .select('enrolled_count')
          .eq('id', class_session_id)
          .single()

        if (sess) {
          const newCount = Math.max(0, sess.enrolled_count - 1)
          await supabase
            .from('class_sessions')
            .update({ enrolled_count: newCount })
            .eq('id', class_session_id)

          if (newCount === 0) {
            await supabase
              .from('class_sessions')
              .delete()
              .eq('id', class_session_id)
              .eq('enrolled_count', 0)
          }
        }

        console.log(`⏰ Trial lesson payment expired, released slot: booking ${booking_id}`)
      }
    }
  }

  return NextResponse.json({ received: true })
}
