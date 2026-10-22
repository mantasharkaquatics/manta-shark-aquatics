import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/api-auth'
// The school's contact address (found 2026-10-15): receipts printed an old
// Gmail address, outside the info@ group every email replies to.
import { CONTACT_EMAIL } from '@/lib/site-config'
import { createHash } from 'crypto'

// The "Print / Save as PDF" button (owner, 2026-10-22: a web receipt the
// family can keep as a PDF). The page's CSP allows exactly this script by its
// hash and nothing else.
const PRINT_JS = "document.getElementById('print').addEventListener('click',function(){window.print()})"
const PRINT_JS_HASH = createHash('sha256').update(PRINT_JS).digest('base64')

// What the family reads for each stored payment_method.
function paymentLabel(raw: unknown): string {
  const m = String(raw || '').trim()
  const k = m.toLowerCase()
  if (k === 'stripe') return 'Card (paid online)'
  if (k === 'stripe_terminal' || k === 'credit card (terminal)') return 'Card (at the front desk)'
  if (k === 'cash') return 'Cash'
  if (k === 'zelle') return 'Zelle'
  return m || 'Paid'
}

// Every value below comes from the database, and several are typed by people
// (names, item names, notes). Interpolated raw, a name like <img onerror=...>
// ran as script on this origin when an admin opened the invoice -- stored XSS
// (found 2026-10-05). Everything dynamic goes through esc().
const esc = (v: unknown) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireUser()
  if (!auth) {
    // The receipt email links straight here (found 2026-10-07). A family
    // opening it signed out is sent to sign in and brought back, rather than
    // shown a bare JSON error. /login reads ?next= through sanitizeNext.
    if ((req.headers.get('accept') || '').includes('text/html')) {
      const url = new URL('/login', req.url)
      url.searchParams.set('next', `/api/invoices/${encodeURIComponent(id)}/pdf`)
      return NextResponse.redirect(url)
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
  // The school's date, not the server's: Vercel runs in UTC, so an evening
  // sale in California printed as the next day (found 2026-10-05).
  const issuedDate = new Date(invoice.issued_at).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'long', day: 'numeric' })
  const items = (invoice.items || []) as { name: string; quantity: number; unit_price: number }[]
  const swimmer = student ? (student.legal_full_name && isSdp ? student.legal_full_name : student.full_name) : ''
  // Every invoice is written after the money arrived (Stripe webhook, POS
  // sale), so this page is the family's receipt: "Paid", how and when.
  const method = paymentLabel(invoice.payment_method)

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${esc(invoice.invoice_number)} · Manta Shark Aquatics</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { background: #eef2f7; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a2e; font-size: 14px; background: #eef2f7; padding-bottom: 24px; }
  .sheet { padding: 60px; background: #fff; max-width: 860px; margin: 16px auto 0; border-radius: 12px; box-shadow: 0 4px 24px rgba(26,39,68,.08); }
  .toolbar { display: flex; justify-content: flex-end; gap: 10px; max-width: 860px; margin: 16px auto 0; padding: 0 16px; }
  .toolbar button { font: inherit; font-size: 14px; font-weight: 700; color: #fff; background: #1a2744; border: 0; border-radius: 10px; padding: 12px 20px; cursor: pointer; min-height: 44px; }
  .toolbar button:focus-visible { outline: 3px solid #c9a84c; outline-offset: 2px; }
  .paid { display: inline-block; margin-top: 8px; font-size: 12px; font-weight: 800; letter-spacing: 2px; color: #1f7a57; border: 2px solid #1f7a57; border-radius: 6px; padding: 3px 10px; }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px 24px; margin-bottom: 32px; }
  .fact-label { font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #c9a84c; margin-bottom: 4px; }
  .fact-value { font-size: 14px; font-weight: 600; color: #1a2744; }
  .table-wrap { overflow-x: auto; }
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
  /* Last, so they beat the rules above. */
  @media (max-width: 640px) {
    .sheet { padding: 24px 18px; margin: 12px 12px 0; border-radius: 10px; }
    .header { flex-direction: column; gap: 20px; }
    .invoice-meta { text-align: left; }
    .invoice-title { font-size: 26px; }
    thead th, tbody td { padding: 10px 8px; }
    .totals-box { min-width: 0; width: 100%; }
    .footer { margin-top: 32px; }
  }
  @media print {
    html, body { background: #fff; }
    body { padding: 0; }
    .sheet { margin: 0; padding: 24px; box-shadow: none; border-radius: 0; max-width: none; }
    .toolbar { display: none; }
    thead tr { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .payment-info { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="toolbar"><button type="button" id="print">Print / Save as PDF</button></div>
  <main class="sheet">
  <div class="header">
    <div class="brand">
      <div class="brand-name">Manta Shark Aquatics</div>
      <div class="brand-sub">Swim School</div>
      <div class="brand-info">
        382 N Lemon Ave STE 821, Walnut, CA 91789<br>
        (909) 323-9573 &middot; ${esc(CONTACT_EMAIL)}
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-title">RECEIPT</div>
      <div class="invoice-number">${esc(invoice.invoice_number)}</div>
      <div class="invoice-date">Paid ${esc(issuedDate)}</div>
      <div class="paid">PAID</div>
    </div>
  </div>

  <hr class="divider">

  <div style="display:flex;justify-content:space-between;gap:24px;" class="bill-to">
    <div>
      <div class="bill-to-label">Received From</div>
      <div class="bill-to-name">${esc(parent?.first_name)} ${esc(parent?.last_name)}</div>
      <div class="bill-to-email">${esc(parent?.email)}</div>
    </div>
    ${isSdp ? `
    <div style="text-align:right;padding:12px 16px;background:#f8f8fb;border-radius:8px;border-right:4px solid #c9a84c;">
      <div class="bill-to-label">Student Information</div>
      <div style="font-size:13px;color:#1a2744;font-weight:700;">${esc(student.legal_full_name || student.full_name)}</div>
      <div style="font-size:12px;color:#333;margin-top:4px;">UCI #: <strong>${esc(student.uci_number)}</strong></div>
      <div style="font-size:12px;color:#333;margin-top:2px;">Service Code: <strong>${esc(student.service_code || '331')}</strong></div>
    </div>` : ''}
  </div>

  <div class="facts">
    <div><div class="fact-label">Payment method</div><div class="fact-value">${esc(method)}</div></div>
    <div><div class="fact-label">Date paid</div><div class="fact-value">${esc(issuedDate)}</div></div>
    ${swimmer && !isSdp ? `<div><div class="fact-label">Swimmer</div><div class="fact-value">${esc(swimmer)}</div></div>` : ''}
  </div>

  <div class="table-wrap">
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
        <td>${esc(item.name)}</td>
        <td style="text-align:center">${esc(item.quantity)}</td>
        <td style="text-align:right">$${Number(item.unit_price).toFixed(2)}</td>
        <td>$${(item.quantity * item.unit_price).toFixed(2)}</td>
      </tr>`).join('')}
    </tbody>
  </table>
  </div>

  <div class="totals">
    <div class="totals-box">
      <div class="total-row"><span>Subtotal</span><span>$${Number(invoice.amount).toFixed(2)}</span></div>
      <div class="total-row"><span>Sales Tax</span><span>$0.00 (Service &ndash; Exempt)</span></div>
      <div class="total-row main"><span>Total paid</span><span>$${Number(invoice.amount).toFixed(2)}</span></div>
    </div>
  </div>

  ${invoice.notes ? `<div class="payment-info"><div class="payment-label">Note</div><div class="payment-method">${esc(invoice.notes)}</div></div>` : ''}

  <div class="footer">
    Thank you for choosing Manta Shark Aquatics &middot; Questions about this receipt: ${esc(CONTACT_EMAIL)}
  </div>
  </main>
  <script>${PRINT_JS}</script>
</body>
</html>`

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Second line of defence behind esc(): this page needs inline styles and
      // nothing else -- no script, no fetches, no frames (found 2026-10-05).
      // The one script is the print button, allowed by its hash.
      'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; script-src 'sha256-${PRINT_JS_HASH}'`,
    },
  })
}
