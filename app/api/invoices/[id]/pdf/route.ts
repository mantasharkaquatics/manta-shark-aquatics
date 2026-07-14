import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/api-auth'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: invoice, error } = await supabase
    .from('invoices')
    .select('*, parents(first_name, last_name, email), students(full_name, legal_full_name, uci_number, service_code)')
    .eq('id', id)
    .single()

  if (error || !invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  // Parents may only download their own invoices; admins may download any
  const { data: adminRow } = await supabase
    .from('admins').select('id').eq('auth_user_id', auth.user.id).single()
  if (!adminRow) {
    const { data: parentRow } = await supabase
      .from('parents').select('id').eq('auth_user_id', auth.user.id).single()
    if (!parentRow || invoice.parent_id !== parentRow.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const parent = Array.isArray(invoice.parents) ? invoice.parents[0] : invoice.parents
  const student = Array.isArray(invoice.students) ? invoice.students[0] : invoice.students
  const isSdp = !!student?.uci_number
  const issuedDate = new Date(invoice.issued_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const items = (invoice.items || []) as { name: string; quantity: number; unit_price: number }[]

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; padding: 60px; font-size: 14px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }
  .brand-name { font-size: 24px; font-weight: 800; color: #1a2744; letter-spacing: -0.5px; }
  .brand-sub { font-size: 12px; color: #c9a84c; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-top: 2px; }
  .brand-info { font-size: 11px; color: #666; margin-top: 8px; line-height: 1.6; }
  .invoice-meta { text-align: right; }
  .invoice-title { font-size: 32px; font-weight: 900; color: #1a2744; letter-spacing: -1px; }
  .invoice-number { font-size: 13px; color: #c9a84c; font-weight: 700; margin-top: 4px; letter-spacing: 1px; }
  .invoice-date { font-size: 12px; color: #888; margin-top: 4px; }
  .divider { border: none; border-top: 2px solid #1a2744; margin: 32px 0; }
  .bill-to { margin-bottom: 40px; }
  .bill-to-label { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #c9a84c; margin-bottom: 8px; }
  .bill-to-name { font-size: 16px; font-weight: 700; color: #1a2744; }
  .bill-to-email { font-size: 12px; color: #666; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  thead tr { background: #1a2744; }
  thead th { color: #fff; padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  thead th:last-child { text-align: right; }
  tbody tr { border-bottom: 1px solid #f0f0f0; }
  tbody td { padding: 14px 16px; font-size: 13px; color: #333; }
  tbody td:last-child { text-align: right; font-weight: 600; }
  .totals { display: flex; justify-content: flex-end; }
  .totals-box { min-width: 260px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #555; }
  .total-row.main { border-top: 2px solid #1a2744; margin-top: 8px; padding-top: 12px; font-size: 16px; font-weight: 800; color: #1a2744; }
  .payment-info { margin-top: 40px; padding: 20px; background: #f8f8fb; border-radius: 8px; border-left: 4px solid #c9a84c; }
  .payment-label { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #c9a84c; margin-bottom: 6px; }
  .payment-method { font-size: 13px; color: #333; font-weight: 600; }
  .footer { margin-top: 60px; text-align: center; font-size: 11px; color: #aaa; }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-name">Manta Shark Aquatics</div>
      <div class="brand-sub">Swim School</div>
      <div class="brand-info">
        382 N Lemon Ave STE 821, Walnut, CA 91789<br>
        (909) 323-9573 &middot; mantasharkaquatics@gmail.com
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-number">${invoice.invoice_number}</div>
      <div class="invoice-date">Issued: ${issuedDate}</div>
    </div>
  </div>

  <hr class="divider">

  <div style="display:flex;justify-content:space-between;gap:24px;" class="bill-to">
    <div>
      <div class="bill-to-label">Bill To</div>
      <div class="bill-to-name">${parent?.first_name || ''} ${parent?.last_name || ''}</div>
      <div class="bill-to-email">${parent?.email || ''}</div>
    </div>
    ${isSdp ? `
    <div style="text-align:right;padding:12px 16px;background:#f8f8fb;border-radius:8px;border-right:4px solid #c9a84c;">
      <div class="bill-to-label">Student / SDP Information</div>
      <div style="font-size:13px;color:#1a2744;font-weight:700;">${student.legal_full_name || student.full_name}</div>
      <div style="font-size:12px;color:#333;margin-top:4px;">UCI #: <strong>${student.uci_number}</strong></div>
      <div style="font-size:12px;color:#333;margin-top:2px;">Service Code: <strong>${student.service_code || '331'}</strong></div>
    </div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:center">Qty</th>
        <th style="text-align:right">Unit Price</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
      <tr>
        <td>${item.name}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">$${Number(item.unit_price).toFixed(2)}</td>
        <td>$${(item.quantity * item.unit_price).toFixed(2)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-box">
      <div class="total-row"><span>Subtotal</span><span>$${Number(invoice.amount).toFixed(2)}</span></div>
      <div class="total-row"><span>Sales Tax</span><span>$0.00 (Service &ndash; Exempt)</span></div>
      <div class="total-row main"><span>Total</span><span>$${Number(invoice.amount).toFixed(2)}</span></div>
    </div>
  </div>

  <div class="payment-info">
    <div class="payment-label">Payment Method</div>
    <div class="payment-method">${
      invoice.payment_method === 'stripe' ? 'Credit / Debit Card (Stripe)'
      : invoice.payment_method === 'card' ? 'Credit Card'
      : invoice.payment_method === 'cash' ? 'Cash'
      : invoice.payment_method
    }</div>
  </div>

  ${invoice.notes ? `<div style="margin-top:24px;font-size:12px;color:#666;"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}

  <div class="footer">
    Thank you for choosing Manta Shark Aquatics &middot; This invoice was generated automatically
  </div>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}
