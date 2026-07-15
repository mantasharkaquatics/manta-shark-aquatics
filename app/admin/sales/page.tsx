import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SalesClient from './SalesClient'

export const dynamic = 'force-dynamic'

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

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, amount, payment_method, items, status, issued_at, parent_id, student_id')
    .order('issued_at', { ascending: false })

  const parentIds = [...new Set((invoices || []).map((i: any) => i.parent_id).filter(Boolean))]
  const parentMap: Record<string, any> = {}
  if (parentIds.length > 0) {
    const { data: parents } = await supabase.from('parents').select('id, first_name, last_name, email').in('id', parentIds)
    for (const p of parents || []) parentMap[p.id] = p
  }

  return <SalesClient invoices={invoices || []} parentMap={parentMap} />
}
