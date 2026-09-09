import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/api-auth'
import { readJson, badRequest } from '@/lib/http'
import { insertInvoice, InvoiceNumberUnavailable } from '@/lib/invoices/create'

export async function POST(req: NextRequest) {
  const internalKey = req.headers.get('x-internal-key')
  if (!internalKey || internalKey !== process.env.CRON_SECRET) {
    const auth = await requireAdmin()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const body = await readJson(req)
  if (!body) return badRequest()
  const { parent_id, lesson_credit_id, amount, payment_method, items, stripe_payment_intent_id, stripe_session_id, notes } = body

  let invoice
  try {
    invoice = await insertInvoice(supabase, {
      parent_id,
      lesson_credit_id: lesson_credit_id || null,
      amount,
      payment_method: payment_method || 'stripe',
      items: items || [],
      status: 'sent',
      stripe_payment_intent_id: stripe_payment_intent_id || null,
      // The key the points statement joins on. A payment reaches us as a
      // checkout session; the ledger records that id, so the invoice has to
      // carry it too or the receipt cannot be found from the statement.
      stripe_session_id: stripe_session_id || null,
      notes: notes || null,
    })
  } catch (e: any) {
    console.error('Invoice create error:', e?.message)
    return NextResponse.json(
      { error: e instanceof InvoiceNumberUnavailable ? 'INVOICE_NUMBER_UNAVAILABLE' : 'Failed to create invoice' },
      { status: 500 },
    )
  }

  return NextResponse.json({ invoice })
}
