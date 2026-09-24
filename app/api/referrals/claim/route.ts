import { NextRequest, NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'
import { claimReferral } from '@/lib/referrals'
import { readJson } from '@/lib/http'

export const runtime = 'nodejs'

// Called once, by the register page, right after the account is created. The
// rules (brand-new account, no bookings, not already referred, not your own
// code) are enforced in lib/referrals, not here and not in the browser.
export async function POST(req: NextRequest) {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const body = await readJson(req)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    const res = await claimReferral(ctx.svc, ctx.parent.id, (body as any).code)
    return NextResponse.json(res, { status: res.ok ? 200 : 400 })
  } catch (e) {
    console.error('referral claim failed:', e)
    return NextResponse.json({ ok: false, error: 'SERVER_ERROR' }, { status: 500 })
  }
}
