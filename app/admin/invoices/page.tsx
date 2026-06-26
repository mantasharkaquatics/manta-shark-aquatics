import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import AdminInvoicesClient from './AdminInvoicesClient'

export default async function AdminInvoicesPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('admins').select('id').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: invoices } = await supabaseAdmin
    .from('invoices')
    .select('*, parents(first_name, last_name, email)')
    .order('issued_at', { ascending: false })
    .limit(100)

  const { data: parents } = await supabaseAdmin
    .from('parents')
    .select('id, first_name, last_name, email')
    .order('first_name')

  const { data: courseTypes } = await supabaseAdmin
    .from('course_types')
    .select('id, name')

  return <AdminInvoicesClient invoices={invoices || []} parents={parents || []} courseTypes={courseTypes || []} />
}
