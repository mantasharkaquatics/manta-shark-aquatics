import { NextResponse } from 'next/server'
import { requireParent } from '@/lib/api-auth'

export const runtime = 'nodejs'

// The dashboard showed the "points running low" pop-up (lib/low-balance.ts):
// remember it, so it shows once per dip on any device. Cleared again when the
// family is no longer low.
export async function POST() {
  const ctx = await requireParent()
  if (!ctx) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const { error } = await ctx.svc.from('point_wallets')
    .update({ low_balance_popup_at: new Date().toISOString() })
    .eq('parent_id', ctx.parent.id)
    .is('low_balance_popup_at', null)
  if (error) return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
