import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { serviceClient } from '@/lib/api-auth'
import AdminMessagesClient from './AdminMessagesClient'

export default async function AdminMessagesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: admin } = await supabase.from('admins').select('id, first_name').eq('auth_user_id', user.id).single()
  if (!admin) redirect('/dashboard')
  // Who recalled a message (owner, 2026-10-23): every admin's first name.
  const { data: all } = await serviceClient().from('admins').select('id, first_name')
  const adminNames: Record<string, string> = {}
  for (const a of all || []) adminNames[a.id] = a.first_name || ''
  return <AdminMessagesClient adminId={admin.id} adminName={admin.first_name} adminNames={adminNames} />
}
