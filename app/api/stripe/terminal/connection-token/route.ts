import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { requireAdmin } from '@/lib/api-auth'

// The secret Stripe Terminal asks for before it can look for a card reader
// (onFetchConnectionToken in app/admin/pos/POSClient.tsx). The POS has called
// this route since it was written, but the route itself was never added, so
// the reader could never connect and every desk sale was cash-only (found
// 2026-10-08).
//
// STRIPE_TERMINAL_LOCATION_ID (optional) is the Terminal location the desk
// reader is registered to in Stripe. With it, the token only finds readers at
// that location. Without it, any reader on the account can be found -- fine
// while there is one desk, and the only option before a reader is bought.
export async function POST() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Card payments are not configured' }, { status: 503 })
  }
  // Same pinned version as the other Stripe routes (the SDK's typings name an older one).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia' as any })
  try {
    const location = process.env.STRIPE_TERMINAL_LOCATION_ID?.trim()
    const token = await stripe.terminal.connectionTokens.create(location ? { location } : {})
    return NextResponse.json({ secret: token.secret })
  } catch (e) {
    console.error('[terminal/connection-token]', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: 'Could not reach Stripe Terminal' }, { status: 502 })
  }
}
