import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { markHandedBack } from '@/lib/refunds'

export const runtime = 'nodejs'

/* Cash to hand back (owner, 2026-10-14). When a refund includes money a family
   paid in cash at the desk, that part cannot go back through Stripe: a person
   hands it over. Each such amount waits here until someone marks it handed.

   Any admin may see the list and mark an amount handed -- whoever is at the
   desk when the family comes in -- and the row keeps who did it and when.
   Only the owner can make the refund itself (/api/admin/refund).

   GET              the amounts still to hand back, oldest first
   POST { id }      mark one handed back */

type Row = {
  id: string
  created_at: string
  parent_id: string
  amount_cents: number
  note: string | null
  created_by: string | null
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await auth.svc.from('refund_legs')
    .select('id, created_at, parent_id, amount_cents, note, created_by')
    .eq('kind', 'hand_back').eq('status', 'to_hand_back')
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    // Before docs/migration-refund-legs.sql has run there is nothing to list.
    if (/refund_legs/.test(error.message) && /does not exist|schema cache/i.test(error.message))
      return NextResponse.json({ items: [], missingTable: true })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const rows = (data || []) as Row[]
  const parentIds = [...new Set(rows.map(r => r.parent_id))]
  const names = new Map<string, string>()
  if (parentIds.length > 0) {
    const { data: parents } = await auth.svc.from('parents').select('id, first_name, last_name').in('id', parentIds)
    for (const p of parents || []) names.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim())
  }
  return NextResponse.json({
    items: rows.map(r => ({
      id: r.id,
      createdAt: r.created_at,
      parentId: r.parent_id,
      family: names.get(r.parent_id) || '',
      amount: Number(r.amount_cents) / 100,
      note: r.note,
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  try {
    const ok = await markHandedBack(auth.svc, String(body.id), `admin:${auth.admin.id}`)
    if (!ok) return NextResponse.json({ error: 'Already marked, or not found', code: 'not_open' }, { status: 409 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error(e?.message || e)
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
}
