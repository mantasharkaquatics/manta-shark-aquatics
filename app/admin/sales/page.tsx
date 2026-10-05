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
    .select('id, invoice_number, amount, payment_method, items, status, issued_at, parent_id, student_id, team_membership_id')
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

  return <SalesClient invoices={invoices} parentMap={parentMap} />
}
