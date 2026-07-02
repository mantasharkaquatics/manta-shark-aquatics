import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/api-auth'

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

  const { parent_id, lesson_credit_id, amount, payment_method, items, stripe_payment_intent_id, notes } = await req.json()

  const year = new Date().getFullYear()
  const { data: seqNum } = await supabase.rpc('get_next_invoice_seq')
  const seq = seqNum || 1
  const invoice_number = `MSA-${year}-${String(seq).padStart(4, '0')}`

  const { data: invoice, error } = await supabase
    .from('invoices')
    .insert({
      invoice_number,
      parent_id,
      lesson_credit_id: lesson_credit_id || null,
      amount,
      payment_method: payment_method || 'stripe',
      items: items || [],
      status: 'sent',
      stripe_payment_intent_id: stripe_payment_intent_id || null,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) {
    console.error('Invoice create error:', error)
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 })
  }

  return NextResponse.json({ invoice })
}
