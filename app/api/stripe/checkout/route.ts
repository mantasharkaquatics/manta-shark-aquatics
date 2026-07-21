import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSvcClient } from '@supabase/supabase-js'
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
}

export async function POST(req: NextRequest) {
  try {
    const { planId, studentId } = await req.json()

    const plan = PLANS[planId]
    if (!plan && planId !== 'team') return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

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

    // Swim Team: per-student monthly subscription (spec v1.1) — $399/mo, level-matched tier, 24 cap
    if (planId === 'team') {
      if (!studentId) return NextResponse.json({ error: 'Please select a student to enroll.' }, { status: 400 })
      const svc = createSvcClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      const { data: student } = await svc
        .from('students').select('id, full_name, parent_id, current_level')
        .eq('id', studentId).single()
      if (!student || student.parent_id !== parent.id)
        return NextResponse.json({ error: 'Student not found on this account.' }, { status: 403 })
      if (!student.current_level)
        return NextResponse.json({ error: 'This student needs a swim assessment before joining the team.' }, { status: 400 })

      const { data: tier } = await svc
        .from('team_tiers').select('id, name')
        .lte('level_min', student.current_level).gte('level_max', student.current_level)
        .eq('active', true).limit(1).single()
      if (!tier)
        return NextResponse.json({ error: 'There is no team for this student\'s current level. Teams start at Level 4.' }, { status: 400 })

      const { count: existing } = await svc
        .from('team_memberships').select('id', { count: 'exact', head: true })
        .eq('student_id', student.id).in('status', ['active', 'past_due'])
      if ((existing || 0) > 0)
        return NextResponse.json({ error: 'This student already has an active team membership.' }, { status: 400 })

      const { count: members } = await svc
        .from('team_memberships').select('id', { count: 'exact', head: true })
        .eq('team_tier_id', tier.id).in('status', ['active', 'past_due'])
      if ((members || 0) >= 24)
        return NextResponse.json({ error: `${tier.name} is currently full — please contact us to join the waitlist.` }, { status: 409 })

      const subMeta = { type: 'team_subscription', parent_id: parent.id, student_id: student.id, team_tier_id: tier.id }
      const session = await stripe.checkout.sessions.create({
        locale: 'en',
        payment_method_types: ['card', 'us_bank_account'],
        mode: 'subscription',
        customer_email: parent.email,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${tier.name} · Monthly Membership (${student.full_name})` },
            unit_amount: 39900,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        metadata: subMeta,
        subscription_data: { metadata: subMeta },
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}&team=1`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/plans`,
      })
      return NextResponse.json({ url: session.url })
    }

    const { data: courseType } = await supabase
      .from('course_types')
      .select('id')
      .eq('slug', plan.courseSlug)
      .single()

    const session = await stripe.checkout.sessions.create({
      locale: 'en',
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
