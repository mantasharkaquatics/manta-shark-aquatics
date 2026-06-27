import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import AdminMembersClient from './AdminMembersClient'

export default async function AdminMembersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )

  const { data: parents } = await supabase
    .from('parents')
    .select(`
      id, first_name, last_name, email, phone,
      registered_at, terms_accepted_at, last_login_at, newsletter_subscribed,
      address_line1, address_line2, city, state, zip_code,
      students(id, full_name, current_level, is_active, date_of_birth)
    `)
    .order('first_name')

  return <AdminMembersClient parents={parents || []} />
}
