import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSvcClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { tierFor, TEAM_SQUAD_CAP } from '@/lib/team-tiers'
// The amount charged has to come from the same table the /plans cards and the
// webhook's validity window read. This route used to keep its own copy, so a
// price edit in lib/plans.ts would have changed what the page advertised and
// how long the credits lasted while still charging the old figure.
import { PLANS } from '@/lib/plans'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

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

    // Swim Team: per-student monthly subscription (spec v1.1) — price comes from
    // team_tiers.monthly_price_cents, level-matched tier, 24 cap
    if (planId === 'team') {
      if (!studentId) return NextResponse.json({ error: 'Please select a student to enroll.' }, { status: 400 })
      const svc = createSvcClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

      const { data: student } = await svc
        .from('students').select('id, full_name, parent_id, current_level, current_stage')
        .eq('id', studentId).single()
      if (!student || student.parent_id !== parent.id)
        return NextResponse.json({ error: 'Student not found on this account.' }, { status: 403 })
      if (!student.current_level)
        return NextResponse.json({ error: 'This student needs a swim assessment before joining the team.' }, { status: 400 })

      // A band runs from one curriculum position to another, and a position is
      // a level and a stage -- Intermediate ends inside Level 7 where Elite
      // begins. That cannot be a level range filter, so read the bands and
      // choose in code.
      const { data: allTiers } = await svc
        .from('team_tiers').select('id, name, monthly_price_cents, level_min, level_max, min_stage, max_stage')
        .eq('active', true).order('level_min').order('min_stage')
      const tier = tierFor(allTiers || [], student.current_level, student.current_stage)
      if (!tier)
        return NextResponse.json({ error: 'There is no team for this student\'s current level. Teams start at Level 4.' }, { status: 400 })

      const { data: existingRows } = await svc
        .from('team_memberships').select('id, stripe_subscription_id, expires_at')
        .eq('student_id', student.id).in('status', ['active', 'past_due'])
      const liveSub = (existingRows || []).find(r => r.stripe_subscription_id)
      if (liveSub)
        return NextResponse.json({ error: 'This student already has an active team membership.' }, { status: 400 })
      // Prepaid conversion (owner 2026-07-22): a live prepaid membership may convert to the subscription;
      // billing anchors at the prepaid expiry via trial_end so no paid days are lost.
      const prepaid = (existingRows || []).find(r => !r.stripe_subscription_id && r.expires_at && new Date(r.expires_at) > new Date()) || null

      if (!prepaid) {
        const { count: members } = await svc
          .from('team_memberships').select('id', { count: 'exact', head: true })
          .eq('team_tier_id', tier.id).in('status', ['active', 'past_due'])
        if ((members || 0) >= TEAM_SQUAD_CAP)
          return NextResponse.json({ error: `${tier.name} is currently full — please contact us to join the waitlist.` }, { status: 409 })
      }

      // Never fall back to a guessed amount — this is a real charge.
      const priceCents = tier.monthly_price_cents
      if (!priceCents || priceCents <= 0)
        return NextResponse.json({ error: 'Team pricing is not configured. Please contact us.' }, { status: 500 })

      const subMeta: Record<string, string> = { type: 'team_subscription', parent_id: parent.id, student_id: student.id, team_tier_id: tier.id }
      if (prepaid) subMeta.prepaid_membership_id = prepaid.id
      // Stripe checkout requires trial_end >48h in the future; if expiry is closer, bill immediately
      const trialEnd = prepaid && new Date(prepaid.expires_at).getTime() > Date.now() + 49 * 3600 * 1000
        ? Math.floor(new Date(prepaid.expires_at).getTime() / 1000)
        : undefined
      const session = await stripe.checkout.sessions.create({
        locale: 'en',
        payment_method_types: ['card', 'us_bank_account'],
        mode: 'subscription',
        customer_email: parent.email,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${tier.name} · Monthly Membership (${student.full_name})` },
            unit_amount: priceCents,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        }],
        metadata: subMeta,
        subscription_data: { metadata: subMeta, ...(trialEnd ? { trial_end: trialEnd } : {}) },
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
