import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// POST { membership_id } → Stripe Customer Portal session URL for that
// membership's subscription. Parent can cancel (at period end), update the
// card, and view invoices there. Ownership is verified: the membership's
// student must belong to the logged-in parent.
export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const svc = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: parent } = await svc
    .from('parents').select('id').eq('auth_user_id', user.id).single()
  if (!parent) return NextResponse.json({ error: 'Parent not found' }, { status: 403 })

  const { membership_id } = await req.json()
  if (!membership_id) return NextResponse.json({ error: 'membership_id required' }, { status: 400 })

  const { data: tm } = await svc
    .from('team_memberships')
    .select('id, student_id, stripe_subscription_id, status')
    .eq('id', membership_id).single()
  if (!tm || !tm.stripe_subscription_id)
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 })

  const { data: student } = await svc
    .from('students').select('id, parent_id').eq('id', tm.student_id).single()
  if (!student || student.parent_id !== parent.id)
    return NextResponse.json({ error: 'Membership not found' }, { status: 403 })

  try {
    const sub = await stripe.subscriptions.retrieve(tm.stripe_subscription_id)
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
    if (!customerId) return NextResponse.json({ error: 'Subscription has no customer' }, { status: 500 })
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.nextUrl.origin}/dashboard`,
      flow_data: {
        type: 'subscription_cancel',
        subscription_cancel: { subscription: tm.stripe_subscription_id },
        after_completion: { type: 'redirect', redirect: { return_url: `${req.nextUrl.origin}/dashboard` } },
      },
    } as any)
    return NextResponse.json({ url: session.url })
  } catch (e: any) {
    console.error('portal session failed:', e?.message)
    return NextResponse.json({ error: 'Could not open the subscription portal. Please contact us.' }, { status: 500 })
  }
}
