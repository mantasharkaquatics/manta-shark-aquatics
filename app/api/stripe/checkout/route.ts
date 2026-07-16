import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

const PLANS: Record<string, { name: string; amount: number; sessions: number; courseSlug: string }> = {
  '1on1-10':  { name: '1-on-1 Private · 10 Sessions',      amount: 65000,  sessions: 10, courseSlug: '1on1' },
  '1on1-20':  { name: '1-on-1 Private · 20 Sessions',      amount: 126000, sessions: 20, courseSlug: '1on1' },
  '1on1-30':  { name: '1-on-1 Private · 30 Sessions',      amount: 185000, sessions: 30, courseSlug: '1on1' },
  '1on1-50':  { name: '1-on-1 Private · 50 Sessions',      amount: 300000, sessions: 50, courseSlug: '1on1' },
  '1on2-10':  { name: '1-on-2 Semi-Private · 10 Sessions', amount: 105000, sessions: 10, courseSlug: '1on2' },
  '1on2-20':  { name: '1-on-2 Semi-Private · 20 Sessions', amount: 200000, sessions: 20, courseSlug: '1on2' },
  '1on2-30':  { name: '1-on-2 Semi-Private · 30 Sessions', amount: 285000, sessions: 30, courseSlug: '1on2' },
  '1on2-50':  { name: '1-on-2 Semi-Private · 50 Sessions', amount: 450000, sessions: 50, courseSlug: '1on2' },
  '1on4-10':  { name: '1-on-4 Group · 10 Sessions', amount: 40000,  sessions: 10, courseSlug: '1on4' },
  '1on4-20':  { name: '1-on-4 Group · 20 Sessions', amount: 76000,  sessions: 20, courseSlug: '1on4' },
  'team':     { name: 'Swim Team · Monthly',                amount: 18000,  sessions: 8,  courseSlug: 'team' },
}

export async function POST(req: NextRequest) {
  try {
    const { planId } = await req.json()

    const plan = PLANS[planId]
    if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 })

    const { data: parent } = await supabase
      .from('parents')
      .select('id, first_name, last_name, email')
      .eq('auth_user_id', user.id)
      .single()

    if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 404 })

    const { data: courseType } = await supabase
      .from('course_types')
      .select('id')
      .eq('slug', plan.courseSlug)
      .single()

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'us_bank_account'],
      mode: 'payment',
      customer_email: parent.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: plan.name },
          unit_amount: plan.amount,
        },
        quantity: 1,
      }],
      metadata: {
        parent_id: parent.id,
        plan_id: planId,
        sessions: String(plan.sessions),
        course_type_id: courseType?.id || '',
        course_slug: plan.courseSlug,
      },
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/plans`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
