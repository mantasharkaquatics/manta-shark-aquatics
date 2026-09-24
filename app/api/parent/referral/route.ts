import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { referralSummary } from '@/lib/referrals'

export const runtime = 'nodejs'

// The referral block on the points card: this family's code, the link to
// share, and the families who have used it (last name and status only).
export async function GET(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  try {
    const summary = await referralSummary(ctx.svc, ctx.parent.id)
    return NextResponse.json({ ...summary, link: `${req.nextUrl.origin}/register?ref=${summary.code}` })
  } catch (e) {
    console.error('referral summary failed:', e)
    return NextResponse.json({ error: 'Could not load referrals' }, { status: 500 })
  }
}
