import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSvcClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { tierFor, TEAM_SQUAD_CAP } from '@/lib/team-tiers'
import { MIN_TOPUP_DOLLARS, MAX_TOPUP_DOLLARS } from '@/lib/points'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

export async function POST(req: NextRequest) {
  try {
    const { planId, studentId, points: pointsDollars } = await req.json()

    // Swim Team is still a monthly membership and still comes through here.
    // Everything else is now a points top-up.
    if (planId && planId !== 'team') {
      return NextResponse.json({ error: 'Lesson packages have been replaced by points' }, { status: 400 })
    }

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

    // ---- POINTS PURCHASE ----------------------------------------------
    // Not a package any more: the parent names a dollar amount and the wallet
    // is credited one point per dollar. lib/points.ts holds what a lesson
    // costs; nothing about the price of lessons belongs in this route.
    const dollars = Math.floor(Number(pointsDollars))
    if (!Number.isFinite(dollars) || dollars < MIN_TOPUP_DOLLARS || dollars > MAX_TOPUP_DOLLARS) {
      return NextResponse.json({ error: 'INVALID_AMOUNT' }, { status: 400 })
    }

    // A brand-new family buys the Swim Assessment, not a wallet full of points.
    // Two reasons, and the second is the one that bites: the booking page
    // refuses to book a swimmer with no level, so without this check a family
    // could pay and then find nothing bookable, with nothing on screen saying
    // why. Deliberately per family, not per student -- once anyone here has a
    // level we have met this family. A level assigned by hand in the admin
    // panel counts, which is how a family assessed in person gets through.
    const svcForGate = createSvcClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data: levelled } = await svcForGate
      .from('students')
      .select('id')
      .eq('parent_id', parent.id)
      .not('current_level', 'is', null)
      .limit(1)
    if (!levelled || levelled.length === 0) {
      // An assessment already on the calendar counts. The gate exists so nobody
      // pays for points they cannot spend -- but a family who has booked the
      // assessment will have a level within days, and telling them to "book a
      // Swim Assessment first" when they have just booked one is the software
      // arguing with something the parent watched itself do.
      const { data: booked } = await svcForGate
        .from('bookings')
        .select('id')
        .eq('parent_id', parent.id)
        .eq('is_trial', true)
        .neq('status', 'cancelled')
        .limit(1)
      if (!booked || booked.length === 0) {
        return NextResponse.json({ error: 'NEEDS_ASSESSMENT' }, { status: 400 })
      }
    }

    const session = await stripe.checkout.sessions.create({
      locale: 'en',
      payment_method_types: ['card', 'us_bank_account'],
      mode: 'payment',
      customer_email: parent.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${dollars.toLocaleString('en-US')} lesson points`,
            description: 'One point books one dollar of lessons. Points never expire.',
          },
          unit_amount: dollars * 100,
        },
        quantity: 1,
      }],
      metadata: {
        kind: 'points',
        parent_id: parent.id,
        points: String(dollars),
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
