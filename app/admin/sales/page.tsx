import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SalesClient from './SalesClient'

export const dynamic = 'force-dynamic'

import { allRowsOrLog, IN_CHUNK } from '@/lib/db-paging'

// Every row, a page at a time; a failed page is logged and the page shows
// what it has (lib/db-paging.ts).
const allRows = (make: () => any) => allRowsOrLog('admin/sales', make)

export default async function AdminSalesPage() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) redirect('/login')

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  // Every invoice, a page at a time. The API returns at most 1,000 rows per
  // request, so a single read quietly dropped everything older than the
  // thousandth invoice from the totals, the filters and the CSV. Ordered by
  // issued_at and then id, so rows sharing a timestamp cannot straddle a page
  // boundary and be read twice or not at all.
  const invoices = await allRows(() => supabase
    .from('invoices')
    .select('id, invoice_number, amount, payment_method, items, status, issued_at, parent_id, student_id, team_membership_id, stripe_session_id, stripe_payment_intent_id, lesson_credit_id')
    .order('issued_at', { ascending: false })
    .order('id', { ascending: false }))

  // Names for those invoices, a slice of ids per request: thousands of ids in
  // one .in() is past what the API will take in a URL.
  const parentIds = [...new Set(invoices.map((i: any) => i.parent_id).filter(Boolean))] as string[]
  const parentMap: Record<string, any> = {}
  for (let i = 0; i < parentIds.length; i += IN_CHUNK) {
    const parents = await allRows(() => supabase.from('parents')
      .select('id, first_name, last_name, email').in('id', parentIds.slice(i, i + IN_CHUNK)).order('id'))
    for (const p of parents) parentMap[p.id] = p
  }

  // Money that did not stay (owner, 2026-10-08): a payment charged back or
  // returned by the bank (purchases.reversed_at), or refunded
  // (purchases.refunded_cents, which the site's own refunds and refunds made
  // in the Stripe dashboard both write). Its invoice stays listed and marked,
  // and is left out of the total and the CSV's net amount -- the deferred
  // revenue page already left these out, so the two disagreed. A purchase is
  // matched to its invoice by checkout session, by the desk's 'pos:<id>' key,
  // by payment intent, or (a Swim Assessment) through its assessment credit.
  const [reversed, refunded] = await Promise.all([
    allRows(() => supabase.from('purchases')
      .select('id, amount_cents, refunded_cents, reversed_at, reversal_reason, stripe_session_id, stripe_payment_intent_id')
      .not('reversed_at', 'is', null).order('id')),
    allRows(() => supabase.from('purchases')
      .select('id, amount_cents, refunded_cents, reversed_at, reversal_reason, stripe_session_id, stripe_payment_intent_id')
      .gt('refunded_cents', 0).order('id')),
  ])
  type Flagged = { id: string; amount_cents: number; refunded_cents: number | null; reversed_at: string | null; reversal_reason: string | null; stripe_session_id: string | null; stripe_payment_intent_id: string | null }
  const flagged = new Map<string, Flagged>()
  for (const p of [...reversed, ...refunded]) flagged.set(p.id, p)
  const byKey = new Map<string, Flagged>()
  for (const p of flagged.values()) {
    if (p.stripe_session_id) byKey.set('s:' + p.stripe_session_id, p)
    if (p.stripe_payment_intent_id) byKey.set('pi:' + p.stripe_payment_intent_id, p)
    byKey.set('s:pos:' + p.id, p)
  }
  const flaggedIds = [...flagged.keys()]
  for (let i = 0; i < flaggedIds.length; i += IN_CHUNK) {
    const credits = await allRows(() => supabase.from('lesson_credits')
      .select('id, purchase_id').in('purchase_id', flaggedIds.slice(i, i + IN_CHUNK)).order('id'))
    for (const c of credits) { const fp = flagged.get(c.purchase_id); if (fp) byKey.set('c:' + c.id, fp) }
  }
  const marked = invoices.map((inv) => {
    const p = (inv.stripe_session_id && byKey.get('s:' + inv.stripe_session_id))
      || (inv.stripe_payment_intent_id && byKey.get('pi:' + inv.stripe_payment_intent_id))
      || (inv.lesson_credit_id && byKey.get('c:' + inv.lesson_credit_id))
    if (!p) return inv
    const amount = Number(inv.amount) || 0
    if (p.reversed_at) {
      return { ...inv, sale_status: p.reversal_reason === 'chargeback' ? 'disputed' : 'returned', net_amount: 0 }
    }
    const back = (Number(p.refunded_cents) || 0) / 100
    return back >= amount
      ? { ...inv, sale_status: 'refunded', net_amount: 0 }
      : { ...inv, sale_status: 'partial', refunded_amount: back, net_amount: Math.round((amount - back) * 100) / 100 }
  })

  return <SalesClient invoices={marked} parentMap={parentMap} />
}
