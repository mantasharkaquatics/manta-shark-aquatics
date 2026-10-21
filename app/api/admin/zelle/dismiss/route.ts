import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** "Not a sale" on a Zelle payment (a personal transfer, a test), or undo it.
 *  Only takes it off the to-do count and out of the POS picker; what was
 *  already used for sales is untouched. Body: { id, note?, undo? }. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const id = body?.id
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const patch = body?.undo
    ? { dismissed_at: null, dismissed_by: null, dismiss_note: null }
    : { dismissed_at: new Date().toISOString(), dismissed_by: auth.admin.id, dismiss_note: String(body?.note || '').trim().slice(0, 300) || null }
  const { data, error } = await auth.svc.from('zelle_receipts').update(patch).eq('id', id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
