import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { checkPointsSale, checkSdpSale, checkTeamSale, type SaleRefusal } from '@/lib/pos/sale-checks'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

const refused = (r: SaleRefusal) => NextResponse.json({ error: r.error, ...(r.extra || {}) }, { status: r.status })

// The PaymentIntent for a desk card sale: points, a programme (SDP) sale, or
// prepaid Swim Team months. The Swim Assessment has its own route.
//
// The sale is checked here, with the same functions the complete-* route runs
// (lib/pos/sale-checks), because once the reader has taken the card it is too
// late to refuse. It used to check only that the amount was between 50c and
// $20,000, so a sale the complete route then refused left the family charged
// with nothing recorded (found 2026-10-05). The amount is worked out here from
// the sale itself; the screen's figure is not used.
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
    const body = await req.json()
    const kind = body?.kind
    const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    let amount: number
    let description: string
    const meta: Record<string, string> = {
      pos_sale: 'true',
      payment_method: 'stripe_terminal',
      parent_id: String(body?.parentId || ''),
    }

    if (kind === 'points') {
      const sale = checkPointsSale(body)
      if (!sale.ok) return refused(sale)
      amount = sale.amountCents
      description = `${sale.dollars.toLocaleString('en-US')} lesson points`
      meta.type = 'points'
    } else if (kind === 'sdp') {
      const sale = await checkSdpSale(svc, body)
      if (!sale.ok) return refused(sale)
      amount = sale.amountCents
      const note = String(body?.description || '').trim()
      description = `${sale.qty} × ${sale.courseType.name} for ${sale.student.full_name}${note ? ` — ${note}` : ''}`
      meta.type = 'sdp_custom'
      meta.student_id = sale.student.id
    } else if (kind === 'team') {
      const sale = await checkTeamSale(svc, body)
      if (!sale.ok) return refused(sale)
      amount = sale.amountCents
      description = `${sale.tier.name} · Prepaid · ${sale.months} month${sale.months > 1 ? 's' : ''}`
      meta.type = 'team_prepaid'
      meta.student_id = sale.student.id
    } else {
      // A screen from before this check existed sends no kind. Refusing is the
      // safe answer: guessing would check the wrong rules and still charge.
      return NextResponse.json({ error: 'Unknown sale type. Reload the page and try again.' }, { status: 400 })
    }
    meta.description = description.slice(0, 200)

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      description: description.slice(0, 1000),
      metadata: meta,
    })
    // The amount goes back so the screen can refuse to collect if it differs
    // from the total the family was shown.
    return NextResponse.json({ clientSecret: paymentIntent.client_secret, amountCents: amount })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
