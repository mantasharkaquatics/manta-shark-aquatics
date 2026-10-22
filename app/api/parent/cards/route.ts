import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireParent } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* The cards the family chose to remember at checkout (lib/stripe-customer.ts,
   owner 2026-10-22). Only what is needed to recognise a card -- brand, last
   four digits, expiry -- ever leaves Stripe.

   GET          -> { cards: [{ id, brand, last4, exp }] }
   DELETE ?id=  -> forgets that card (it is detached from the family) */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-05-27.dahlia' as any })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function customerOf(svc: any, parentId: string): Promise<string | null> {
  const { data, error } = await svc.from('parents').select('stripe_customer_id').eq('id', parentId).maybeSingle()
  return error ? null : (data?.stripe_customer_id as string) || null
}

export async function GET() {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const customer = await customerOf(ctx.svc, ctx.parent.id)
  if (!customer) return NextResponse.json({ cards: [] })
  try {
    const list = await stripe.customers.listPaymentMethods(customer, { type: 'card', limit: 20 })
    const cards = list.data
      // Only cards the family ticked "save" for; Stripe may hold others it
      // will not offer again.
      .filter(pm => (pm as { allow_redisplay?: string }).allow_redisplay === 'always')
      .map(pm => ({ id: pm.id, brand: pm.card?.brand || 'card', last4: pm.card?.last4 || '', exp: pm.card ? `${String(pm.card.exp_month).padStart(2, '0')}/${String(pm.card.exp_year).slice(-2)}` : '' }))
    return NextResponse.json({ cards }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[parent/cards]', err instanceof Error ? err.message : '')
    return NextResponse.json({ error: 'unavailable', code: 'unavailable' }, { status: 503 })
  }
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const customer = await customerOf(ctx.svc, ctx.parent.id)
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!customer || !/^pm_[A-Za-z0-9]+$/.test(id)) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
  try {
    const pm = await stripe.paymentMethods.retrieve(id)
    if (pm.customer !== customer) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
    await stripe.paymentMethods.detach(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[parent/cards] detach', err instanceof Error ? err.message : '')
    return NextResponse.json({ error: 'Could not remove the card', code: 'server' }, { status: 500 })
  }
}
