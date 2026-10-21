import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/api-auth'
import { adminRole } from '@/lib/staff-accounts'
import { googleConfigured, syncZelle } from '@/lib/zelle-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export type ZelleReceiptRow = {
  id: string
  payer_name: string
  amount_cents: number
  remaining_cents: number
  memo: string | null
  body_excerpt: string | null
  received_at: string
  verified: boolean
  dismissed_at: string | null
  dismiss_note: string | null
  uses: { id: string; amount_cents: number; sale_kind: string; parent_name: string | null; invoice_id: string | null; invoice_number: string | null; created_at: string }[]
}

/**
 * Zelle payments the bank has told us about (lib/zelle-server.ts).
 *   ?open=1   only those POS can still use: verified, not dismissed, money left.
 *             What the POS Zelle picker shows.
 *   ?sync=1   read the mailbox first, so a payment sent a minute ago shows.
 *   ?days=N   how far back the full list goes (default 60).
 * Also says whether Gmail is connected, for the Zelle page's header.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { svc } = auth
  const sp = req.nextUrl.searchParams
  const open = sp.get('open') === '1'

  let sync: Awaited<ReturnType<typeof syncZelle>> | null = null
  if (sp.get('sync') === '1') sync = await syncZelle(svc)

  const days = Math.min(Math.max(Number(sp.get('days')) || 60, 1), 400)
  let q = svc.from('zelle_receipts')
    .select('id, payer_name, amount_cents, memo, body_excerpt, received_at, verified, dismissed_at, dismiss_note')
    .order('received_at', { ascending: false })
    .limit(500)
  if (open) q = q.eq('verified', true).is('dismissed_at', null)
  else q = q.gte('received_at', new Date(Date.now() - days * 86400_000).toISOString())
  const { data: receipts, error } = await q
  if (error) {
    // The migration has not been run yet: say so instead of a bare 500.
    if (/zelle_receipts/.test(error.message)) return NextResponse.json({ error: 'not_installed', receipts: [] }, { status: 503 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const ids = (receipts || []).map((r: any) => r.id)
  const uses: any[] = []
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await svc.from('zelle_allocations')
      .select('id, receipt_id, amount_cents, sale_kind, parent_id, invoice_id, created_at')
      .in('receipt_id', ids.slice(i, i + 200))
    uses.push(...(data || []))
  }
  const parentIds = [...new Set(uses.map(u => u.parent_id).filter(Boolean))]
  const invoiceIds = [...new Set(uses.map(u => u.invoice_id).filter(Boolean))]
  const [{ data: parents }, { data: invoices }] = await Promise.all([
    parentIds.length ? svc.from('parents').select('id, first_name, last_name').in('id', parentIds) : Promise.resolve({ data: [] as any[] }),
    invoiceIds.length ? svc.from('invoices').select('id, invoice_number').in('id', invoiceIds) : Promise.resolve({ data: [] as any[] }),
  ])
  const pName = new Map((parents || []).map((p: any) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ')]))
  const invNo = new Map((invoices || []).map((v: any) => [v.id, v.invoice_number]))

  let rows: ZelleReceiptRow[] = (receipts || []).map((r: any) => {
    const mine = uses.filter(u => u.receipt_id === r.id)
    const used = mine.reduce((a, u) => a + u.amount_cents, 0)
    return {
      ...r,
      remaining_cents: r.amount_cents - used,
      uses: mine.map(u => ({
        id: u.id, amount_cents: u.amount_cents, sale_kind: u.sale_kind,
        parent_name: u.parent_id ? pName.get(u.parent_id) || null : null,
        invoice_id: u.invoice_id, invoice_number: u.invoice_id ? invNo.get(u.invoice_id) || null : null,
        created_at: u.created_at,
      })),
    }
  })
  if (open) rows = rows.filter(r => r.remaining_cents > 0)

  const { data: conn } = await svc.from('zelle_gmail')
    .select('email, connected_at, last_sync_at, last_error').eq('id', 1).maybeSingle()
  const owner = (await adminRole(svc, auth.admin.id)) === 'super_admin'

  return NextResponse.json({
    receipts: rows,
    gmail: conn ? { ...conn, connected: true } : { connected: false },
    googleConfigured: googleConfigured(),
    owner,
    sync,
  })
}
