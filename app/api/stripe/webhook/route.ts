import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' })

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

  return NextResponse.json({ received: true })
}
