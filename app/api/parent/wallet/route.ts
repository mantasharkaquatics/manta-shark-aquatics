import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { walletSummary } from '@/lib/points-wallet'

export const runtime = 'nodejs'

// Balance, VIP tier, progress to the next one, and remaining late-cancel
// forgiveness -- everything the dashboard card and the booking page need, in
// one call. Replaces /api/parent/tokens.
export async function GET() {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    return NextResponse.json(await walletSummary(ctx.svc, ctx.parent.id))
  } catch (e: any) {
    console.error('wallet summary error:', e)
    return NextResponse.json({ error: 'Could not read the wallet' }, { status: 500 })
  }
}
