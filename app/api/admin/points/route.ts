import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { applyPoints, walletSummary } from '@/lib/points-wallet'
import { MAX_TOPUP_DOLLARS } from '@/lib/points'

export const runtime = 'nodejs'

// Adjusting a family's points by hand.
//
// This is the only way to handle an exception, and it exists so that no
// exception ever becomes "edit the database". Every adjustment needs a reason,
// which the parent sees on their own statement -- a movement they cannot
// account for is worse than the problem it was meant to fix.
//
// Added points are GRANTED, not purchased: they spend exactly like any other
// point but are not refundable for cash, because no cash came in for them.

const MAX_ADJUST = MAX_TOPUP_DOLLARS

export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parentId = req.nextUrl.searchParams.get('parent_id')
  if (!parentId) return NextResponse.json({ error: 'parent_id required' }, { status: 400 })

  const summary = await walletSummary(auth.svc, parentId)
  const { data: rows } = await auth.svc
    .from('point_ledger')
    .select('id, created_at, delta_purchased, delta_granted, balance_purchased_after, balance_granted_after, reason, note, amount_cents, actor')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: false })
    .limit(40)

  // Referrals both ways: who brought this family in, and whom they brought.
  const [{ data: inbound }, { data: outbound }] = await Promise.all([
    auth.svc.from('referrals').select('referrer_parent_id, status').eq('referred_parent_id', parentId).maybeSingle(),
    auth.svc.from('referrals').select('referred_parent_id, status').eq('referrer_parent_id', parentId),
  ])
  const ids = [inbound?.referrer_parent_id, ...(outbound || []).map((r: any) => r.referred_parent_id)].filter(Boolean)
  const { data: fams } = ids.length
    ? await auth.svc.from('parents').select('id, first_name, last_name').in('id', ids)
    : { data: [] as any[] }
  const nameOf = new Map((fams || []).map((f: any) => [f.id, `${f.first_name || ''} ${f.last_name || ''}`.trim()]))

  return NextResponse.json({
    ...summary,
    referral: {
      referredBy: inbound ? { name: nameOf.get(inbound.referrer_parent_id) || '—', status: inbound.status } : null,
      referred: (outbound || []).map((r: any) => ({ name: nameOf.get(r.referred_parent_id) || '—', status: r.status })),
    },
    ledger: (rows || []).map((r: any) => ({
      id: r.id,
      at: r.created_at,
      points: (r.delta_purchased || 0) + (r.delta_granted || 0),
      purchased: r.delta_purchased || 0,
      granted: r.delta_granted || 0,
      balanceAfter: (r.balance_purchased_after || 0) + (r.balance_granted_after || 0),
      reason: r.reason,
      note: r.note,
      amountCents: r.amount_cents,
      actor: r.actor,
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { parent_id, points, note } = body

  const n = Math.trunc(Number(points))
  if (!parent_id) return NextResponse.json({ error: 'parent_id required' }, { status: 400 })
  if (!Number.isFinite(n) || n === 0)
    return NextResponse.json({ error: 'Enter a number of points to add or take away' }, { status: 400 })
  if (Math.abs(n) > MAX_ADJUST)
    return NextResponse.json({ error: `One adjustment cannot exceed ${MAX_ADJUST.toLocaleString('en-US')} points` }, { status: 400 })
  const reasonText = String(note || '').trim()
  if (reasonText.length < 3)
    return NextResponse.json({ error: 'A reason is required — the parent sees it on their statement' }, { status: 400 })

  try {
    const res = await applyPoints(auth.svc, {
      parentId: parent_id,
      reason: n > 0 ? 'admin_grant' : 'admin_deduct',
      points: n,
      // Only an addition goes to the granted side. A deduction comes off
      // granted points first anyway, which is the right order: take back what
      // was given before touching what was paid for.
      toGranted: n > 0,
      note: reasonText.slice(0, 300),
      actor: `admin:${auth.admin.id}`,
    })
    return NextResponse.json({ ok: true, balance: res.balance })
  } catch (e: any) {
    if (e?.name === 'InsufficientPoints')
      return NextResponse.json({ error: `This family only has ${e.available} points` }, { status: 409 })
    console.error('admin points adjust failed:', e)
    return NextResponse.json({ error: 'Could not adjust the points' }, { status: 500 })
  }
}
