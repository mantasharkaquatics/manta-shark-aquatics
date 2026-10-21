import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The sidebar's number (owner, 2026-10-21): Zelle payments the bank has
 *  received that still have money no desk sale has used, and that nobody
 *  marked "not a sale". Small tables, so worked out here. */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: receipts, error } = await auth.svc.from('zelle_receipts')
    .select('id, amount_cents').eq('verified', true).is('dismissed_at', null)
    .order('received_at', { ascending: false }).limit(500)
  if (error || !receipts || receipts.length === 0) return NextResponse.json({ count: 0 })
  const { data: uses } = await auth.svc.from('zelle_allocations')
    .select('receipt_id, amount_cents').in('receipt_id', receipts.map(r => r.id))
  const used = new Map<string, number>()
  for (const u of uses || []) used.set(u.receipt_id, (used.get(u.receipt_id) || 0) + u.amount_cents)
  const count = receipts.filter(r => r.amount_cents - (used.get(r.id) || 0) > 0).length
  return NextResponse.json({ count })
}
