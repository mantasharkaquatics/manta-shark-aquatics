import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { amountCents, description, kind } = await req.json()

    // Every desk sale is an amount now -- a points top-up or a negotiated
    // programme sale. There is no fixed package list left to look a price up in.
    const amount = Math.round(Number(amountCents))
    if (!Number.isFinite(amount) || amount < 50 || amount > 2000000) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }
    const meta: Record<string, string> = {
      pos_sale: 'true',
      payment_method: 'stripe_terminal',
      type: kind === 'sdp' ? 'sdp_custom' : 'points',
      description: String(description || '').slice(0, 200),
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      metadata: meta,
    })
    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
