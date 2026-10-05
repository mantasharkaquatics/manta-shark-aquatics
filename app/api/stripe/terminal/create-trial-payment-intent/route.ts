import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { checkTrialSale } from '@/lib/pos/sale-checks'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// The PaymentIntent for a desk Swim Assessment. The swimmer is checked here
// with the same rules /api/pos/complete-trial-sale applies (lib/pos/sale-checks)
// -- belongs to this family, no assessment used, no level yet, no assessment
// already booked -- because a refusal after the reader has taken the card
// leaves the family charged $85 with nothing recorded (found 2026-10-05).
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
    const body = await req.json().catch(() => ({}))
    const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const sale = await checkTrialSale(svc, body || {})
    if (!sale.ok) return NextResponse.json({ error: sale.error }, { status: sale.status })

    const paymentIntent = await stripe.paymentIntents.create({
      amount: sale.amountCents,
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      description: `Swim Assessment - ${sale.student.full_name}`,
      metadata: {
        pos_sale: 'true', payment_method: 'stripe_terminal', type: 'trial_lesson',
        parent_id: sale.student.parent_id, student_id: sale.student.id,
      },
    })
    return NextResponse.json({ clientSecret: paymentIntent.client_secret, amountCents: sale.amountCents })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
